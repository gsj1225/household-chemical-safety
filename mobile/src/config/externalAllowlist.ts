/**
 * externalAllowlist — 外部资料域名白名单（安全配置）
 *
 * 仅当移动端开启外部检索（allowExternalSearch=true）且后端返回 external_hit
 * 时才会涉及外部来源。ExternalSourceCard 只能打开 hostname 完整命中此白名单
 * 的 https 链接；任何子域名、端口、用户名密码或编码变体均不允许绕过。
 *
 * 域名使用小写、无端口、无协议的形式，便于 hostname 精确比对。
 * 修改前请评估来源可信度与合规要求。
 */
export const EXTERNAL_SOURCE_ALLOWLIST: readonly string[] = Object.freeze([
  // 示例：接入真实外部检索前应为空或仅包含经审核的权威域名。
  // 'example.gov',
]);
