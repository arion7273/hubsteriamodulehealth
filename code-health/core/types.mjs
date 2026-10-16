/**
 * @typedef {'duplication' | 'unused-code' | 'unused-dependency' | 'lint' | 'typescript' | 'asset-bloat' | 'bundle-bloat' | 'maintenance'} FindingCategory
 */

/**
 * @typedef {'critical' | 'high' | 'medium' | 'low'} FindingPriority
 */

/**
 * @typedef {'high' | 'medium' | 'low'} FindingConfidence
 */

/**
 * @typedef {'high' | 'medium' | 'low'} CleanupRisk
 */

/**
 * @typedef {'open' | 'accepted' | 'resolved' | 'unverified'} FindingStatus
 */

/**
 * @typedef {object} CodeLocation
 * @property {string} file
 * @property {number} [line]
 * @property {number} [endLine]
 * @property {string} [symbol]
 */

/**
 * @typedef {object} CodeHealthFinding
 * @property {string} id
 * @property {FindingCategory} category
 * @property {FindingPriority} priority
 * @property {FindingConfidence} confidence
 * @property {CleanupRisk} cleanupRisk
 * @property {CodeLocation[]} locations
 * @property {string} scanner
 * @property {unknown} evidence
 * @property {string} summary
 * @property {string} whyItMatters
 * @property {string} proposedChange
 * @property {string[]} affectedWorkflows
 * @property {string[]} verificationRequired
 * @property {FindingStatus} status
 * @property {string} [statusReason]
 * @property {string} fingerprint
 */

/**
 * @typedef {'completed' | 'failed' | 'skipped' | 'unavailable'} ScannerRunStatus
 */

/**
 * @typedef {object} ScannerRunResult
 * @property {string} id
 * @property {string} name
 * @property {ScannerRunStatus} status
 * @property {string} [version]
 * @property {number} durationMs
 * @property {string} [error]
 * @property {string} [skipReason]
 * @property {CodeHealthFinding[]} findings
 * @property {unknown} [raw]
 */

/**
 * @typedef {object} CodeHealthRepoConfig
 * @property {string} id
 * @property {string} repoRoot
 * @property {string} reportsDir
 * @property {string} backlogPath
 * @property {string} baselineFileName
 * @property {{ label: string, includeGlobs: string[] }} scope
 * @property {{ jscpd: string[], knip: string[], assets: string[] }} exclusions
 * @property {object} jscpd
 * @property {object} knip
 * @property {object} eslint
 * @property {object} typescript
 * @property {object} bundle
 * @property {object} assets
 */

/**
 * @typedef {object} AuditMeta
 * @property {string} repository
 * @property {string} branch
 * @property {string} commit
 * @property {boolean} dirtyWorkingTree
 * @property {string} scanTimeIso
 * @property {Record<string, string>} toolVersions
 * @property {string} scopeLabel
 * @property {string[]} exclusions
 */

/**
 * @typedef {object} AuditReport
 * @property {string} schemaVersion
 * @property {AuditMeta} meta
 * @property {ScannerRunResult[]} scanners
 * @property {CodeHealthFinding[]} findings
 * @property {string} reportId
 */

export {};
