// config/env.ts
//
// Leo el .env y lo valido al arrancar. Si falta algo, el servidor no arranca.

import 'dotenv/config'; // tiene que ir primero: lee el .env antes de validar
import { z } from 'zod';

// Coerce para que el puerto pueda llegar como texto desde el .env.
const esquemaEnv = z.object({
    DB_HOST: z.string().min(1, 'no puede estar vacio'),
    DB_USER: z.string().min(1, 'no puede estar vacio'),
    DB_PASSWORD: z.string(),
    DB_DATABASE: z.string().min(1, 'no puede estar vacio'),

    // min(16) es el requisito real de HMAC-SHA256 con una clave legible. Con
    // menos, un atacante podria probar claves mas rapido. El mensaje de error
    // lo dice, en vez de solo fallar.
    JWT_SECRETO: z.string().min(16, 'debe tener al menos 16 caracteres'),

    PUERTO: z.coerce.number().int().min(1).max(65535).default(3002),

    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Cuanto se guarda en pantalla el log de cada peticion. En produccion
    // conviene subirlo a 'silent' o 'warn' para no llenar el disco.
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),

    // Origenes que pueden llamar a la API. Vacio significa "cualquiera", que es
    // lo que hace que el frontend funcione abierto como archivo local.
    CORS_ORIGENES: z.string().default('')
});

export type Env = z.infer<typeof esquemaEnv>;

function cargar(): Env {
    const resultado = esquemaEnv.safeParse(process.env);

    if (resultado.success) {
        return resultado.data;
    }

    // Se imprime el problema en formato legible y se sale. No se lanza una
    // excepcion porque el stack de zod oculta el mensaje util entre un mar de
    // issues anidados.
    const problemas = resultado.error.issues
        .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
        .join('\n');

    console.error('\n' + '='.repeat(64));
    console.error('  CONFIGURACION INVALIDA: la API no arranca.\n');
    console.error(problemas);
    console.error('\n  Como arreglarlo:');
    console.error('    1. Copia backend/.env.example a backend/.env');
    console.error('    2. Completa los valores con los datos reales de tu MySQL');
    console.error('    3. JWT_SECRETO necesita minimo 16 caracteres. No va en el codigo.');
    console.error('\n  El archivo .env NUNCA se sube al repositorio.');
    console.error('='.repeat(64) + '\n');

    process.exit(1);
}

export const env: Env = cargar();

/**
 * Lista de origenes permitidos, ya separada y sin entradas vacias.
 *
 * Si CORS_ORIGENES esta vacio devuelve null, que es la senal de "deja pasar
 * cualquiera". Se decide en un solo lugar para que app.ts no tenga que
 * interpretar strings.
 */
export function origenesCORS(): string[] | null {
    const crudo = env.CORS_ORIGENES.trim();
    if (crudo === '') return null;
    const lista = crudo
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o !== '');
    return lista.length > 0 ? lista : null;
}
