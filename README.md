# AgronomoDigital 🌾

Sistema para pequeños y medianos productores agrícolas del estado Sucre. Permite registrar parcelas, llevar los costos de producción (preparación de suelo, insumos, mano de obra, cosecha) y calcular el punto de equilibrio sobre el precio de venta del quintal.

## Estructura del proyecto

```
AgronomoDigital/
├── backend/          → API REST (Node.js + Express + TypeScript + MySQL)
│   └── API_DOCUMENTACION.md → contrato de endpoints para el equipo de frontend
├── frontend/         → (pendiente: equipo de interfaz)
└── ingesta-python/   → (pendiente: equipo de recolección de datos)
```

## Backend

API RESTful con autenticación JWT (bcrypt para contraseñas).

### Requisitos
- Node.js
- MySQL (base de datos `agronomodigital`)

### Puesta en marcha

```bash
cd backend
npm install
# copia el archivo .env.example a .env y llena tus credenciales reales
npm run dev
```

El servidor corre en `http://localhost:3002`.

### Scripts
- `npm run dev` → arranca con recarga automática (tsx watch)

### Tecnologías
Express · TypeScript · MySQL2 · bcryptjs · jsonwebtoken · dotenv

## Equipo (Grupo CyberBichos)

- **Integrante 3 — José**: Backend y Base de Datos
- Integrantes 1 y 2: Frontend
- Integrante Python: Ingesta de datos