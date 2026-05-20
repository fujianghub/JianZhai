declare module 'plantuml-encoder' {
  /** DEFLATE + custom base64 used by PlantUML servers' ``/svg/{encoded}`` paths. */
  export function encode(source: string): string;
  /** Reverse of ``encode``; rarely needed in client code but exported by upstream. */
  export function decode(encoded: string): string;
  const _default: { encode: typeof encode; decode: typeof decode };
  export default _default;
}
