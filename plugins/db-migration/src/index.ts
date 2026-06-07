interface EntityField {
  name: string; type: string; primary?: boolean; unique?: boolean;
  nullable?: boolean; default?: unknown; values?: string[];
}
interface EntityRelation {
  kind: string; target: string; foreignKey: string;
}
interface Entity {
  name: string; fields: EntityField[]; relations?: EntityRelation[];
}

export interface MigrationResult {
  ok: boolean;
  prismaSchema?: string;
  sqlMigrations?: Array<{ name: string; sql: string }>;
  error?: string;
}

function mapToPrismaType(field: EntityField): string {
  const map: Record<string, string> = {
    uuid: 'String @id @default(uuid())', string: 'String', number: 'Int', boolean: 'Boolean',
    date: 'DateTime', datetime: 'DateTime', text: 'String @db.Text', json: 'Json', enum: 'Enum?',
  };
  return map[field.type] ?? 'String';
}

function generatePrismaSchema(entities: Entity[], dbType: string): string {
  const datasource = dbType === 'sqlite'
    ? 'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}'
    : 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}';
  const generator = 'generator client {\n  provider = "prisma-client-js"\n}';
  const models: string[] = [];

  for (const entity of entities) {
    const lines: string[] = [`model ${entity.name} {`];
    for (const field of entity.fields) {
      if (field.type === 'uuid' && field.primary) {
        lines.push(`  ${field.name} String @id @default(uuid())`);
        continue;
      }
      const typeStr = mapToPrismaType(field);
      const attrs: string[] = [];
      if (field.unique) attrs.push('@unique');
      if (field.default !== undefined) attrs.push(`@default(${JSON.stringify(field.default)})`);
      const nullable = field.nullable ? '?' : '';
      lines.push(`  ${field.name} ${typeStr}${nullable} ${attrs.join(' ')}`.trimEnd());
    }
    for (const rel of (entity.relations ?? [])) {
      const targetLower = rel.target.charAt(0).toLowerCase() + rel.target.slice(1);
      if (rel.kind === 'hasMany') lines.push(`  ${targetLower}s ${rel.target}[]`);
      else if (rel.kind === 'belongsTo') {
        lines.push(`  ${rel.foreignKey} String`);
        lines.push(`  ${targetLower} ${rel.target} @relation(fields: [${rel.foreignKey}], references: [id])`);
      }
    }
    lines.push('}\n');
    models.push(lines.join('\n'));
  }
  return `${datasource}\n${generator}\n${models.join('\n')}`;
}

function generateSqlMigration(entities: Entity[], dbType: string): string {
  const tables: string[] = [];
  for (const entity of entities) {
    const cols: string[] = [];
    for (const field of entity.fields) {
      let sqlType = 'TEXT';
      if (field.type === 'number') sqlType = 'INTEGER';
      else if (field.type === 'boolean') sqlType = 'BOOLEAN';
      else if (field.type === 'date' || field.type === 'datetime') sqlType = 'TIMESTAMP';
      else if (field.type === 'json') sqlType = 'JSONB';
      const constraints: string[] = [];
      if (field.primary) constraints.push('PRIMARY KEY');
      if (!field.nullable && !field.primary) constraints.push('NOT NULL');
      if (field.unique) constraints.push('UNIQUE');
      cols.push(`  "${field.name}" ${sqlType} ${constraints.join(' ')}`.trimEnd());
    }
    tables.push(`CREATE TABLE "${entity.name}" (\n${cols.join(',\n')}\n);`);
  }
  return tables.join('\n\n');
}

export function generateMigration(input: { entities: Entity[]; recommendedDb: string }): MigrationResult {
  try {
    const { entities, recommendedDb } = input;
    if (!entities?.length) return { ok: false, error: 'No entities provided' };
    const prismaSchema = generatePrismaSchema(entities, recommendedDb);
    const sql = generateSqlMigration(entities, recommendedDb);
    return { ok: true, prismaSchema, sqlMigrations: [{ name: '001_initial_schema', sql }] };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
