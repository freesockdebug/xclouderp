import type { DomainAuditSuite } from './types';
import { coreInfraAuditSuite } from './01-core-infra-and-sync.audit';
import { dbAuthRbacAuditSuite } from './02-db-auth-and-rbac.audit';
import { erpDomainMcpAuditSuite } from './03-erp-domain-and-mcp.audit';
import { frontendUiStateAuditSuite } from './04-frontend-ui-and-state.audit';
import { securityOpsRuntimeAuditSuite } from './05-security-ops-and-runtime.audit';

export const ALL_DOMAIN_SUITES: DomainAuditSuite[] = [
  coreInfraAuditSuite,
  dbAuthRbacAuditSuite,
  erpDomainMcpAuditSuite,
  frontendUiStateAuditSuite,
  securityOpsRuntimeAuditSuite,
];
