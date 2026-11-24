// Leo el .env y lo valido al arrancar. Si falta algo, el servidor no arranca.

import 'dotenv/config';
import { z } from 'zod';

const esquemaEnv = z.object({
    DB_PATH: z.string().min(1, 'no puede estar vacio').default('./data/agronomodigital.db'),

    JWT_SECRETO: z.string().min(16, 'debe tener al menos 16 caracteres'),

    PUERTO: z.coerce.number().int().min(1).max(65535).default(3002),

    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),

    CORS_ORIGENES: z.string().default(''),

    HECTAREAS_POR_MANZANA: z.coerce.number().positive().default(0.6989)
});

export type Env = z.infer<typeof esquemaEnv>;

function cargar(): Env {
    const resultado = esquemaEnv.safeParse(process.env);

    if (resultado.success) {
        return resultado.data;
    }

    const problemas = resultado.error.issues
        .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
        .join('\n');

    console.error('\n' + '='.repeat(64));
    console.error('  CONFIGURACION INVALIDA: la API no arranca.\n');
    console.error(problemas);
    console.error('\n  Como arreglarlo:');
    console.error('    1. Copia backend/.env.example a backend/.env');
    console.error('    2. Completa DB_PATH con la ruta al archivo .db');
    console.error('    3. JWT_SECRETO necesita minimo 16 caracteres. No va en el codigo.');
    console.error('\n  El archivo .env NUNCA se sube al repositorio.');
    console.error('='.repeat(64) + '\n');

    process.exit(1);
}

export const env: Env = cargar();

export function origenesCORS(): string[] | null {
    const crudo = env.CORS_ORIGENES.trim();
    if (crudo === '') return null;
    const lista = crudo
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o !== '');
    return lista.length > 0 ? lista : null;
}
