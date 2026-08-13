// Minimale Typdeklaration für das pure-JS-Modul "net-snmp" (bringt keine eigenen
// Typen mit). Deckt nur die im Main-Prozess (snmp:query) genutzten Teile ab.
declare module 'net-snmp' {
  export const Version1: number
  export const Version2c: number
  export const ObjectType: { Integer: number; OctetString: number } & Record<string, number>

  export interface Varbind {
    oid: string
    type: number
    value: unknown
  }

  export interface Session {
    on(event: 'error', cb: (err: Error) => void): void
    get(oids: string[], cb: (error: Error | null, varbinds: Varbind[]) => void): void
    set(varbinds: Varbind[], cb: (error: Error | null, varbinds: Varbind[]) => void): void
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCb: (varbinds: Varbind[]) => void,
      doneCb: (error?: Error | null) => void,
    ): void
    close(): void
  }

  export interface SessionOptions {
    version?: number
    timeout?: number
    retries?: number
    port?: number
  }

  export function createSession(target: string, community: string, options?: SessionOptions): Session
  export function isVarbindError(vb: Varbind): boolean
  export function varbindError(vb: Varbind): string
}
