import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple


@dataclass
class Column:
    name: str
    col_type: str
    nullable: bool = True


@dataclass
class ForeignKey:
    columns: List[str]
    ref_table: str
    ref_columns: List[str]
    constraint_name: Optional[str] = None


@dataclass
class Table:
    name: str
    columns: List[Column] = field(default_factory=list)
    primary_keys: Set[str] = field(default_factory=set)
    foreign_keys: List[ForeignKey] = field(default_factory=list)


CONSTRAINT_STARTERS = (
    "PRIMARY KEY",
    "UNIQUE",
    "KEY",
    "INDEX",
    "CONSTRAINT",
    "FOREIGN KEY",
    "CHECK",
    "FULLTEXT",
    "SPATIAL",
)

COLUMN_CONSTRAINT_KEYWORDS = {
    "NOT",
    "NULL",
    "DEFAULT",
    "AUTO_INCREMENT",
    "PRIMARY",
    "UNIQUE",
    "COMMENT",
    "REFERENCES",
    "COLLATE",
    "CHARACTER",
    "CHECK",
    "CONSTRAINT",
    "ON",
    "GENERATED",
    "AS",
    "VIRTUAL",
    "STORED",
}


def normalize_identifier(token: str) -> str:
    token = token.strip()
    if not token:
        return token

    token = re.sub(r"\([^)]*\)$", "", token.strip())
    parts = [part.strip().strip("`\"") for part in token.split(".") if part.strip()]
    if not parts:
        return token.strip("`\"")
    return parts[-1]


def remove_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", "", sql)
    sql = re.sub(r"#[^\n]*", "", sql)
    return sql


def split_top_level(input_text: str, delimiter: str = ",") -> List[str]:
    items: List[str] = []
    buffer: List[str] = []
    depth = 0
    quote: Optional[str] = None
    escaped = False

    for ch in input_text:
        if quote:
            buffer.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            continue

        if ch in ("'", '"', "`"):
            quote = ch
            buffer.append(ch)
            continue

        if ch == "(":
            depth += 1
            buffer.append(ch)
            continue

        if ch == ")":
            depth = max(depth - 1, 0)
            buffer.append(ch)
            continue

        if ch == delimiter and depth == 0:
            item = "".join(buffer).strip()
            if item:
                items.append(item)
            buffer = []
            continue

        buffer.append(ch)

    tail = "".join(buffer).strip()
    if tail:
        items.append(tail)

    return items


def extract_create_table_blocks(sql: str) -> List[Tuple[str, str]]:
    cleaned = remove_sql_comments(sql)
    lower_sql = cleaned.lower()
    blocks: List[Tuple[str, str]] = []

    idx = 0
    while True:
        start = lower_sql.find("create table", idx)
        if start == -1:
            break

        open_paren = cleaned.find("(", start)
        if open_paren == -1:
            break

        header = cleaned[start + len("create table") : open_paren].strip()
        header = re.sub(r"^if\s+not\s+exists\s+", "", header, flags=re.I).strip()
        table_name = normalize_identifier(header)

        depth = 0
        close_paren = -1
        for i in range(open_paren, len(cleaned)):
            ch = cleaned[i]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    close_paren = i
                    break

        if close_paren == -1:
            break

        body = cleaned[open_paren + 1 : close_paren]
        if table_name:
            blocks.append((table_name, body))

        idx = close_paren + 1

    return blocks


def extract_column_type(rest: str) -> str:
    rest = rest.strip()
    if not rest:
        return "UNKNOWN"

    depth = 0
    quote: Optional[str] = None
    escaped = False

    for i, ch in enumerate(rest):
        if quote:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            continue

        if ch in ("'", '"', "`"):
            quote = ch
            continue

        if ch == "(":
            depth += 1
            continue

        if ch == ")":
            depth = max(depth - 1, 0)
            continue

        if ch.isspace() and depth == 0:
            remainder = rest[i:].lstrip()
            keyword = remainder.split(None, 1)[0].upper() if remainder else ""
            if keyword in COLUMN_CONSTRAINT_KEYWORDS:
                return rest[:i].strip()

    return rest


def parse_identifier_list(text: str) -> List[str]:
    return [normalize_identifier(part) for part in split_top_level(text) if normalize_identifier(part)]


def parse_primary_key(definition: str) -> List[str]:
    match = re.search(r"PRIMARY\s+KEY\s*\(([^)]*)\)", definition, flags=re.I | re.S)
    if not match:
        return []
    return parse_identifier_list(match.group(1))


def parse_foreign_key(definition: str) -> Optional[ForeignKey]:
    pattern = re.compile(
        r"^(?:CONSTRAINT\s+`?(\w+)`?\s+)?"
        r"FOREIGN\s+KEY\s*\(([^)]*)\)\s+"
        r"REFERENCES\s+(`?[\w]+`?(?:\.`?[\w]+`?)?)\s*\(([^)]*)\)",
        flags=re.I | re.S,
    )
    match = pattern.search(definition.strip())
    if not match:
        return None

    constraint_name, columns, ref_table, ref_columns = match.groups()
    return ForeignKey(
        columns=parse_identifier_list(columns),
        ref_table=normalize_identifier(ref_table),
        ref_columns=parse_identifier_list(ref_columns),
        constraint_name=constraint_name,
    )


def parse_column_definition(definition: str) -> Optional[Tuple[Column, bool, Optional[ForeignKey]]]:
    definition = definition.strip()
    if not definition:
        return None

    upper = definition.upper()
    if upper.startswith(CONSTRAINT_STARTERS):
        return None

    match = re.match(r"^`?([A-Za-z_][\w$]*)`?\s+(.+)$", definition, flags=re.S)
    if not match:
        return None

    column_name = normalize_identifier(match.group(1))
    tail = match.group(2).strip()
    col_type = extract_column_type(tail)
    nullable = "NOT NULL" not in upper
    is_pk_inline = "PRIMARY KEY" in upper

    inline_fk: Optional[ForeignKey] = None
    ref_match = re.search(
        r"REFERENCES\s+(`?[\w]+`?(?:\.`?[\w]+`?)?)\s*\(([^)]*)\)",
        definition,
        flags=re.I | re.S,
    )
    if ref_match:
        inline_fk = ForeignKey(
            columns=[column_name],
            ref_table=normalize_identifier(ref_match.group(1)),
            ref_columns=parse_identifier_list(ref_match.group(2)),
            constraint_name=None,
        )

    return Column(name=column_name, col_type=col_type, nullable=nullable), is_pk_inline, inline_fk


def parse_mysql_schema(sql: str) -> Tuple[List[Table], List[str]]:
    blocks = extract_create_table_blocks(sql)
    tables: Dict[str, Table] = {}
    warnings: List[str] = []

    for table_name, body in blocks:
        table = tables.setdefault(table_name, Table(name=table_name))
        definitions = split_top_level(body)

        for definition in definitions:
            cleaned_def = definition.strip()
            upper = cleaned_def.upper()

            if upper.startswith("PRIMARY KEY"):
                table.primary_keys.update(parse_primary_key(cleaned_def))
                continue

            fk = parse_foreign_key(cleaned_def)
            if fk:
                table.foreign_keys.append(fk)
                continue

            parsed_column = parse_column_definition(cleaned_def)
            if not parsed_column:
                if cleaned_def and not upper.startswith(("UNIQUE", "KEY", "INDEX", "CHECK", "FULLTEXT", "SPATIAL")):
                    warnings.append(f"未识别定义: {cleaned_def[:120]}")
                continue

            column, is_pk_inline, inline_fk = parsed_column
            table.columns.append(column)
            if is_pk_inline:
                table.primary_keys.add(column.name)
            if inline_fk:
                table.foreign_keys.append(inline_fk)

    return list(tables.values()), warnings


def mermaid_entity_name(table_name: str, used: Set[str]) -> str:
    safe = re.sub(r"[^A-Za-z0-9_]", "_", table_name)
    if not safe:
        safe = "T"
    if safe[0].isdigit():
        safe = f"T_{safe}"

    candidate = safe
    suffix = 1
    while candidate in used:
        suffix += 1
        candidate = f"{safe}_{suffix}"

    used.add(candidate)
    return candidate


def mermaid_type(col_type: str) -> str:
    base = col_type.strip()
    if not base:
        return "UNKNOWN"

    base = base.upper()
    if "(" in base:
        base = base.split("(", 1)[0]
    base = re.sub(r"\s+", "_", base)
    base = re.sub(r"[^A-Z0-9_]", "", base)
    return base or "UNKNOWN"


def generate_mermaid_er(tables: List[Table]) -> str:
    used_entity_names: Set[str] = set()
    entity_map: Dict[str, str] = {}

    for table in tables:
        entity_map[table.name] = mermaid_entity_name(table.name, used_entity_names)

    lines: List[str] = ["erDiagram"]

    fk_columns_by_table: Dict[str, Set[str]] = {}
    for table in tables:
        for fk in table.foreign_keys:
            fk_columns_by_table.setdefault(table.name, set()).update(fk.columns)

    for table in tables:
        entity = entity_map[table.name]
        lines.append(f"    {entity} {{")

        for column in table.columns:
            flags: List[str] = []
            if column.name in table.primary_keys:
                flags.append("PK")
            if column.name in fk_columns_by_table.get(table.name, set()):
                flags.append("FK")

            flag_text = f" {' '.join(flags)}" if flags else ""
            lines.append(f"        {mermaid_type(column.col_type)} {column.name}{flag_text}")

        lines.append("    }")

    for table in tables:
        child_entity = entity_map[table.name]
        for fk in table.foreign_keys:
            parent_entity = entity_map.get(fk.ref_table)
            if not parent_entity:
                continue

            child_is_identifying = set(fk.columns) and set(fk.columns).issubset(table.primary_keys)
            right_cardinality = "||" if child_is_identifying else "o{"

            relation_label = f"{', '.join(fk.ref_columns)} -> {', '.join(fk.columns)}"
            lines.append(f"    {parent_entity} ||--{right_cardinality} {child_entity} : \"{relation_label}\"")

    return "\n".join(lines)


def mermaid_node_id(prefix: str, raw: str, used: Set[str]) -> str:
    safe = re.sub(r"[^A-Za-z0-9_]", "_", raw)
    if not safe:
        safe = "N"
    if safe[0].isdigit():
        safe = f"N_{safe}"

    candidate = f"{prefix}_{safe}"
    suffix = 1
    while candidate in used:
        suffix += 1
        candidate = f"{prefix}_{safe}_{suffix}"

    used.add(candidate)
    return candidate


def mermaid_label(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace('"', '\\"')


def is_fk_unique_by_pk(table: Table, fk: ForeignKey) -> bool:
    fk_cols = set(fk.columns)
    return bool(fk_cols) and fk_cols == table.primary_keys


def is_associative_table(table: Table) -> bool:
    if len(table.foreign_keys) != 2:
        return False

    fk_cols: Set[str] = set()
    for fk in table.foreign_keys:
        fk_cols.update(fk.columns)

    if not fk_cols:
        return False

    if not table.primary_keys:
        return False

    # Typical junction table pattern: PK is made from FK columns.
    if not table.primary_keys.issubset(fk_cols):
        return False

    if len(table.primary_keys.intersection(fk_cols)) < 2:
        return False

    return True


def build_chen_model(tables: List[Table]) -> Dict[str, List[Dict]]:
    table_map: Dict[str, Table] = {table.name: table for table in tables}
    used_ids: Set[str] = set()
    association_tables: Set[str] = set()

    for table in tables:
        if not is_associative_table(table):
            continue
        ref_tables = {fk.ref_table for fk in table.foreign_keys}
        if ref_tables.issubset(table_map.keys()) and len(ref_tables) == 2:
            association_tables.add(table.name)

    entity_id_map: Dict[str, str] = {}
    entities: List[Dict] = []
    relationships: List[Dict] = []

    for table in tables:
        if table.name in association_tables:
            continue

        entity_id = mermaid_node_id("E", table.name, used_ids)
        entity_id_map[table.name] = entity_id

        attributes: List[Dict] = []
        for column in table.columns:
            attr_id = mermaid_node_id("A", f"{table.name}_{column.name}", used_ids)
            attributes.append({
                "id": attr_id,
                "name": column.name,
                "isPrimary": column.name in table.primary_keys,
            })

        entities.append({
            "id": entity_id,
            "name": table.name,
            "attributes": attributes,
        })

    for table in tables:
        if table.name in association_tables:
            continue

        child_entity_id = entity_id_map.get(table.name)
        if not child_entity_id:
            continue

        for index, fk in enumerate(table.foreign_keys, start=1):
            parent_entity_id = entity_id_map.get(fk.ref_table)
            if not parent_entity_id:
                continue

            relation_name = fk.constraint_name or f"{table.name}_{fk.ref_table}_{index}"
            relation_id = mermaid_node_id("R", relation_name, used_ids)
            child_cardinality = "1" if is_fk_unique_by_pk(table, fk) else "N"

            relationships.append({
                "id": relation_id,
                "name": relation_name,
                "endpoints": [
                    {"entityId": parent_entity_id, "cardinality": "1"},
                    {"entityId": child_entity_id, "cardinality": child_cardinality},
                ],
                "attributes": [],
            })

    for table in tables:
        if table.name not in association_tables:
            continue

        relation_id = mermaid_node_id("R_ASSOC", table.name, used_ids)
        fk_cols: Set[str] = set()
        endpoints: List[Dict] = []

        for fk in table.foreign_keys:
            fk_cols.update(fk.columns)
            parent_entity_id = entity_id_map.get(fk.ref_table)
            if not parent_entity_id:
                continue
            parent_cardinality = "1" if is_fk_unique_by_pk(table, fk) else "N"
            endpoints.append({
                "entityId": parent_entity_id,
                "cardinality": parent_cardinality,
            })

        relation_attributes: List[Dict] = []
        for column in table.columns:
            if column.name in fk_cols:
                continue
            attr_id = mermaid_node_id("A_ASSOC", f"{table.name}_{column.name}", used_ids)
            relation_attributes.append({
                "id": attr_id,
                "name": column.name,
                "isPrimary": column.name in table.primary_keys,
            })

        if len(endpoints) >= 2:
            relationships.append({
                "id": relation_id,
                "name": table.name,
                "endpoints": endpoints,
                "attributes": relation_attributes,
            })

    return {
        "entities": entities,
        "relationships": relationships,
    }


def generate_mermaid_chen(tables: List[Table]) -> str:
    table_map: Dict[str, Table] = {table.name: table for table in tables}
    used_ids: Set[str] = set()
    association_tables: Set[str] = set()

    for table in tables:
        if not is_associative_table(table):
            continue
        ref_tables = {fk.ref_table for fk in table.foreign_keys}
        if ref_tables.issubset(table_map.keys()) and len(ref_tables) == 2:
            association_tables.add(table.name)

    entity_ids: Dict[str, str] = {}
    lines: List[str] = [
        "flowchart LR",
        "    classDef entity fill:#ffffff,stroke:#111111,stroke-width:2px,color:#111111;",
        "    classDef relationship fill:#ffffff,stroke:#111111,stroke-width:2px,color:#111111;",
        "    classDef attribute fill:#ffffff,stroke:#111111,stroke-width:1.6px,color:#111111;",
        "    classDef pk stroke:#111111,stroke-width:3px;",
    ]

    for table in tables:
        if table.name in association_tables:
            continue
        entity_id = mermaid_node_id("E", table.name, used_ids)
        entity_ids[table.name] = entity_id
        lines.append(f'    {entity_id}["{mermaid_label(table.name)}"]')
        lines.append(f"    class {entity_id} entity;")

    for table in tables:
        if table.name in association_tables:
            continue
        entity_id = entity_ids.get(table.name)
        if not entity_id:
            continue

        for column in table.columns:
            attr_id = mermaid_node_id("A", f"{table.name}_{column.name}", used_ids)
            attr_label = f"{column.name} (PK)" if column.name in table.primary_keys else column.name
            lines.append(f'    {attr_id}(["{mermaid_label(attr_label)}"])')
            if column.name in table.primary_keys:
                lines.append(f"    class {attr_id} attribute,pk;")
            else:
                lines.append(f"    class {attr_id} attribute;")
            lines.append(f"    {entity_id} --- {attr_id}")

    for table in tables:
        if table.name in association_tables:
            continue
        child_entity_id = entity_ids.get(table.name)
        if not child_entity_id:
            continue

        for index, fk in enumerate(table.foreign_keys, start=1):
            parent_entity_id = entity_ids.get(fk.ref_table)
            if not parent_entity_id:
                continue

            relation_name = fk.constraint_name or f"{table.name}_{fk.ref_table}_{index}"
            relation_id = mermaid_node_id("R", relation_name, used_ids)
            lines.append(f'    {relation_id}{{"{mermaid_label(relation_name)}"}}')
            lines.append(f"    class {relation_id} relationship;")

            child_cardinality = "1" if is_fk_unique_by_pk(table, fk) else "N"
            lines.append(f"    {parent_entity_id} ---|1| {relation_id}")
            lines.append(f"    {relation_id} ---|{child_cardinality}| {child_entity_id}")

    for table in tables:
        if table.name not in association_tables:
            continue

        relation_id = mermaid_node_id("R_ASSOC", table.name, used_ids)
        lines.append(f'    {relation_id}{{"{mermaid_label(table.name)}"}}')
        lines.append(f"    class {relation_id} relationship;")

        fk_cols: Set[str] = set()
        for fk in table.foreign_keys:
            fk_cols.update(fk.columns)
            parent_entity_id = entity_ids.get(fk.ref_table)
            if not parent_entity_id:
                continue
            parent_cardinality = "1" if is_fk_unique_by_pk(table, fk) else "N"
            lines.append(f"    {parent_entity_id} ---|{parent_cardinality}| {relation_id}")

        for column in table.columns:
            if column.name in fk_cols:
                continue
            attr_id = mermaid_node_id("A_ASSOC", f"{table.name}_{column.name}", used_ids)
            attr_label = f"{column.name} (PK)" if column.name in table.primary_keys else column.name
            lines.append(f'    {attr_id}(["{mermaid_label(attr_label)}"])')
            if column.name in table.primary_keys:
                lines.append(f"    class {attr_id} attribute,pk;")
            else:
                lines.append(f"    class {attr_id} attribute;")
            lines.append(f"    {relation_id} --- {attr_id}")

    return "\n".join(lines)
