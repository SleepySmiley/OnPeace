/**
 * Registro del server: un file di testo al giorno in `logs/`, più i file per riprodurre gli errori.
 * Scrivere il registro non deve mai far cadere il server: ogni errore di scrittura viene ignorato.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Logger {
  info(message: string): void;
  error(message: string, err?: unknown): void;
  /** Salva un file JSON con tutto ciò che serve a riprodurre un errore; restituisce il percorso. */
  dump(name: string, data: unknown): string | null;
}

const stamp = (d = new Date()) => d.toISOString().replace('T', ' ').slice(0, 19);
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const describe = (err: unknown) => (err instanceof Error ? (err.stack ?? err.message) : String(err));

/** Registro su file in `dir` (e sulla console). */
export function fileLogger(dir: string): Logger {
  const write = (line: string) => {
    try {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, `server-${day()}.log`), `${line}\n`);
    } catch {
      // disco pieno o file bloccato: resta la console
    }
  };
  return {
    info(message) {
      const line = `${stamp()}  ${message}`;
      console.log(line);
      write(line);
    },
    error(message, err) {
      const line = `${stamp()}  ERRORE  ${message}${err === undefined ? '' : `\n${describe(err)}`}`;
      console.error(line);
      write(line);
    },
    dump(name, data) {
      try {
        const folder = join(dir, 'errori');
        mkdirSync(folder, { recursive: true });
        const file = join(folder, `${name}-${Date.now()}.json`);
        writeFileSync(file, JSON.stringify(data));
        return file;
      } catch {
        return null;
      }
    },
  };
}

/** Solo console (predefinito quando non serve un file). */
export const consoleLogger: Logger = {
  info: (m) => console.log(`${stamp()}  ${m}`),
  error: (m, err) => console.error(`${stamp()}  ERRORE  ${m}${err === undefined ? '' : `\n${describe(err)}`}`),
  dump: () => null,
};

/** Registro in memoria, per i test. */
export function memoryLogger() {
  const lines: string[] = [];
  const dumps: { name: string; data: unknown }[] = [];
  const log: Logger = {
    info: (m) => void lines.push(m),
    error: (m, err) => void lines.push(`ERRORE ${m}${err === undefined ? '' : `: ${describe(err)}`}`),
    dump: (name, data) => {
      dumps.push({ name, data: structuredClone(data) });
      return name;
    },
  };
  return { log, lines, dumps };
}

export { describe as describeError };
