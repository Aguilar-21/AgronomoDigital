# 📋 API AgrónomoDigital — Documentación para el Frontend

> Proyecto: AgrónomoDigital — Backend con Node.js + Express.js + TypeScript + MySQL
> Autor: Integrante 3 (Backend y Base de Datos) — Grupo CyberBichos
> Estado: **En desarrollo** (se actualiza conforme avance)

---

## Información general

- **Base URL:** `http://localhost:3002`
- **Formato de datos:** JSON (todas las respuestas)
- **Autenticación:** Token JWT (expira en 2 horas)
- **Regla general:** las rutas con 🔒 requieren el token en el encabezado:

```
Authorization: Bearer <token>
```

El token se obtiene al hacer login y debe guardarse en el frontend (ej. localStorage).

---

## Tabla de rutas disponibles

| Método | Ruta | Protegida | Qué hace |
|--------|------|-----------|----------|
| GET | `/` | ❌ | Verificar que la API está viva |
| POST | `/registro` | ❌ | Crear cuenta de usuario |
| POST | `/login` | ❌ | Iniciar sesión y obtener token |
| GET | `/parcelas` | 🔒 | Listar parcelas del usuario |
| POST | `/parcelas` | 🔒 | Crear una parcela |
| PUT | `/parcelas/:id` | 🔒 | Editar una parcela |
| DELETE | `/parcelas/:id` | 🔒 | Eliminar una parcela |
| POST | `/costos` | 🔒 | Registrar un costo |
| GET | `/parcelas/:id/costos` | 🔒 | Ver los costos de una parcela |

---

## Rutas sin autenticación (públicas)

### GET `/`
Verifica que el servidor esté corriendo.

**Respuesta (texto):**
```
Bienvenido a AgronomoDigital
```

---

### POST `/registro`
Crea una cuenta de usuario. La contraseña se guarda encriptada (bcrypt), nunca en texto plano.

**Body que envía el frontend:**
```json
{
  "nombre": "Juan Pérez",
  "correo": "juan@correo.com",
  "contrasena": "miClave123"
}
```

**Respuesta correcta (201 Created):**
```json
{
  "mensaje": "Usuario registrado"
}
```

**Posible error (500):**
```json
{
  "error": "Error al registrar usuario"
}
```

---

### POST `/login`
Inicia sesión y devuelve el **token JWT** que se usa para las rutas protegidas.

**Body que envía el frontend:**
```json
{
  "correo": "juan@correo.com",
  "contrasena": "miClave123"
}
```

**Respuesta correcta (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "mensaje": "Sesión inciada"
}
```

**Posible error (401):**
```json
{
  "error": "Correo o contraseña incorrectos"
}
```

> **Importante para el frontend:** el token debe guardarse y enviarse en el encabezado `Authorization` de todas las rutas con 🔒.

---

## Rutas protegidas — Parcelas

### GET `/parcelas`
Lista las parcelas del usuario autenticado.

**Header requerido:**
```
Authorization: Bearer <token>
```

**Respuesta correcta (200)** — arreglo de parcelas:
```json
[
  {
    "id_parcela": 5,
    "id_usuario": 4,
    "nombre_parcela": "Lote Norte",
    "ubicacion": "Cumaná",
    "tamano": "2.50"
  }
]
```

---

### POST `/parcelas`
Crea una parcela para el usuario autenticado.

**Body que envía el frontend:**
```json
{
  "nombre_parcela": "Lote Norte",
  "ubicacion": "Cumaná",
  "tamano": 2.5
}
```
> `ubicacion` y `tamano` son opcionales (pueden ir vacíos, null).

**Respuesta correcta (201 Created):**
```json
{
  "mensaje": "Parcela creada"
}
```

---

### PUT `/parcelas/:id`
Edita una parcela existente. Solo el dueño de la parcela puede editarla.

**Body que envía el frontend:**
```json
{
  "nombre_parcela": "Lote Norte Ampliado",
  "ubicacion": "Cumaná",
  "tamano": 5.0
}
```

**Respuesta correcta (200):**
```json
{
  "mensaje": "Parcela actualizada"
}
```

**Posible error (404)** — la parcela no existe o no es del usuario:
```json
{
  "error": "Parcela no encontrada o no es tuya"
}
```

---

### DELETE `/parcelas/:id`
Elimina una parcela existente. Solo el dueño puede eliminarla.

**Respuesta correcta (200):**
```json
{
  "mensaje": "Parcela eliminada"
}
```

**Posible error (404):**
```json
{
  "error": "Parcela no encontrada o no es tuya"
}
```

---

## Rutas protegidas — Costos

### POST `/costos`
Registra un costo asociado a una parcela. Antes de insertar, el backend verifica que la parcela sea del usuario autenticado.

**Body que envía el frontend:**
```json
{
  "id_parcela": 5,
  "tipo_costo": "Preparación de suelo",
  "descripcion": "Arado y nivelación",
  "monto": 1500.00,
  "fecha": "2026-09-20"
}
```
> `tipo_costo` son las fases del proyecto: Preparación de suelo, Insumos, Mano de obra, Cosecha.

**Respuesta correcta (201 Created):**
```json
{
  "mensaje": "Costo registrado"
}
```

**Posible error (404):**
```json
{
  "error": "La parcela no existe o no es tuya"
}
```

---

### GET `/parcelas/:id/costos`
Devuelve los costos de una parcela específica, pero **solo si la parcela es del usuario autenticado** (usa un JOIN entre `transacciones_costos` y `parcelas`).

**Respuesta correcta (200)** — arreglo de costos:
```json
[
  {
    "id_transaccion": 4,
    "id_parcela": 5,
    "tipo_costo": "Insumos",
    "descripcion": "Abono y semillas",
    "monto": "1500.00",
    "fecha": "2026-09-20T06:00:00.000Z"
  }
]
```

**Si la parcela no es del usuario:** responde con arreglo vacío `[]`.

---

## Códigos de estado HTTP usados

| Código | Significado | Cuándo aparece |
|--------|-------------|----------------|
| 200 | OK | Petición exitosa |
| 201 | Created | Se creó un recurso (registro, parcela, costo) |
| 401 | Unauthorized | Sin token, token inválido o credenciales incorrectas |
| 404 | Not Found | Recurso no existe o no es del usuario |
| 500 | Server Error | Error interno del servidor |

---

## Endpoints pendientes (se actualizará)

- Cálculo del **costo total** y **costo por quintal** de una parcela
- Cálculo del **punto de equilibrio**
- **Historial de precios** (`historial_precios`): listar y registrar precios de venta por quintal
- CRUD de **usuario** (editar perfil) — depende del alcance acordado con el equipo

---

## Notas técnicas (para el equipo)

- La base de datos es `agronomodigital` con las tablas: `usuarios`, `parcelas`, `transacciones_costos`, `historial_precios`.
- Las contraseñas se guardan encriptadas con **bcrypt**.
- El token JWT expira en **2 horas**; el frontend debe manejar el 401 y pedir login de nuevo.
- Fechas: MySQL devuelve `DATE` como objeto, por eso en JSON puede verse `"2026-09-20T06:00:00.000Z"`. Se puede formatear en el frontend o ajustar en una próxima versión del backend.

---

*Documento generado el 22/09/2026. Se actualiza conforme avanza el desarrollo.*