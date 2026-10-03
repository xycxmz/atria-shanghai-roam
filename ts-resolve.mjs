// 让 node ESM 能解析项目内无扩展名的相对 TS 导入（补 .ts 后缀）。
// 仅供纯逻辑探针使用：node --experimental-strip-types probe-loader.mjs
export function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ?? '';
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  if (
    isRelative &&
    !/\.[cm]?[jt]sx?$/.test(specifier) &&
    (parent.includes('/atria-demo-v1/') || parent.includes('/atria-demo-v1\\'))
  ) {
    return nextResolve(specifier + '.ts', context);
  }
  return nextResolve(specifier, context);
}
