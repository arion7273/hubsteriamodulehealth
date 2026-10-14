/**
 * @typedef {object} Evidence
 * @property {string} type
 * @property {string} [path]
 * @property {number} [line]
 * @property {string} [snippet]
 */

/**
 * @typedef {object} Remediation
 * @property {string} summary
 * @property {string[]} [steps]
 * @property {string} [docUrl]
 */

/**
 * @typedef {object} FixMeta
 * @property {'auto'|'assisted'|'manual'} capability
 * @property {'high'|'medium'|'low'} [confidence]
 * @property {string} [fixId]
 * @property {'low'|'medium'|'high'} [risk]
 * @property {string} [preview]
 */

/**
 * @typedef {object} Finding
 * @property {string} checkId
 * @property {string} moduleId
 * @property {string} category
 * @property {import('./finding.mjs').Layer} layer
 * @property {import('./finding.mjs').CheckStatus} status
 * @property {import('./finding.mjs').Severity} severity
 * @property {string} title
 * @property {string} [detail]
 * @property {number} [durationMs]
 * @property {Evidence[]} evidence
 * @property {Remediation} [remediation]
 * @property {FixMeta} [fix]
 * @property {boolean} [fixedInRun]
 */

/**
 * @typedef {object} ModuleConfig
 * @property {string} moduleId
 * @property {string} displayName
 * @property {string} root
 * @property {string} [tier]
 * @property {string[]} [requiredLayers]
 */

/**
 * @typedef {object} CheckContext
 * @property {ModuleConfig} module
 * @property {string} moduleRootAbs
 * @property {import('./manifest.mjs').Manifest}
 */

/**
 * @typedef {object} CheckDef
 * @property {string} checkId
 * @property {string} category
 * @property {import('./finding.mjs').Layer} layer
 * @property {string} title
 * @property {(ctx: CheckContext) => Promise<Finding>|Finding} run
 */
