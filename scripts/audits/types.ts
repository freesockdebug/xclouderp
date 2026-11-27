export interface AuditViolation {
  ruleId: string;
  domain: string;
  docPath: string;
  title: string;
  historicalContext: string;
  file: string;
  line?: number;
  snippet?: string;
  remediation: string;
}

export interface AuditContext {
  rootDir: string;
  readFile(relPath: string): string;
  fileExists(relPath: string): boolean;
  listFiles(dirRelPath: string, extRegex?: RegExp): string[];
}

export interface AuditRule {
  id: string;
  domain: string;
  docPath: string;
  title: string;
  historicalContext: string;
  remediation: string;
  check: (ctx: AuditContext) => AuditViolation[];
}

export interface DomainAuditSuite {
  domain: string;
  name: string;
  docPath: string;
  triggerPatterns: RegExp[];
  unitTestFiles: string[];
  rules: AuditRule[];
  verify?: (ctx: AuditContext) => Promise<AuditViolation[]>;
}

export function findLineNumber(content: string, index: number): number {
  if (index <= 0) return 1;
  return content.slice(0, index).split('\n').length;
}
