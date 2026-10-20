# Auditor de Sostenibilidad y Calculadora de Huella de Carbono para PyMEs

Prototipo full-stack (Node.js + Express) para relevar la huella de carbono de una PyME de forma
conversacional (chat con function calling) y mediante la carga de facturas de servicios (OCR + visión),
con generación final de un reporte en PDF y persistencia híbrida (Supabase o memoria).

## Instalación

```bash
cd auditor-sostenibilidad
npm install
cp .env.example .env
# completar GROQ_API_KEY (obligatoria) y, opcionalmente, SUPABASE_URL / SUPABASE_KEY
npm start
```

Abrir `http://localhost:3000`.

## Modo de almacenamiento

- Si `SUPABASE_URL` y `SUPABASE_KEY` están configuradas en `.env`, la app persiste todo en Supabase.
  Antes de usarla, ejecutar `sql/schema.sql` en el SQL Editor de tu proyecto Supabase.
- Si no están configuradas, la app cae automáticamente a almacenamiento **en memoria** (se pierde
  al reiniciar el servidor). Esto permite probar el prototipo sin necesidad de una cuenta de Supabase.

Podés verificar el modo activo en `GET /api/estado`.

## Flujo de uso

1. **Crear empresa + auditoría** (`POST /api/empresas`, `POST /api/auditorias`): desde el frontend,
   completar el formulario inicial con nombre de la empresa y período a auditar.
2. **Relevamiento conversacional** (`POST /api/chat/:auditoriaId`): chatear con el asistente
   "EcoAuditor" contándole los consumos (ej: *"gastamos 850 kWh de luz en enero"*). El modelo
   detecta el dato y llama automáticamente a la función `registrar_consumo`, que calcula el CO2
   y lo persiste.
3. **Carga de facturas** (`POST /api/auditorias/:auditoriaId/facturas`): subir un PDF o imagen de
   factura. El sistema intenta extraer texto (pdf-parse o Tesseract OCR) y, si no alcanza, usa el
   modelo de visión de Groq sobre la imagen directamente. Devuelve datos estructurados
   (categoría, consumo, proveedor, etc.) para que el usuario los revise.
4. **Confirmar factura** (`POST /api/facturas/:id/confirmar`): el usuario corrige/confirma
   categoría y consumo; ahí se calcula el CO2 definitivo y se registra la emisión.
5. **Reporte final** (`GET /api/auditorias/:id/reporte`): descarga un PDF con el resumen de
   emisiones por categoría, equivalencias intuitivas y recomendaciones de mejora generadas por reglas.

## Estructura de endpoints (`/api`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/estado` | Estado del servidor (almacenamiento activo, Groq configurado) |
| POST | `/empresas` | Crear empresa |
| GET | `/empresas` | Listar empresas |
| GET | `/empresas/:id` | Detalle de empresa |
| POST | `/auditorias` | Crear auditoría |
| GET | `/empresas/:empresaId/auditorias` | Auditorías de una empresa |
| GET | `/auditorias/:id` | Detalle completo de auditoría (empresa + facturas + emisiones + recomendaciones + totales) |
| POST | `/auditorias/:id/recomendaciones` | Regenerar recomendaciones |
| POST | `/auditorias/:id/completar` | Marcar auditoría como completada |
| GET | `/auditorias/:id/reporte` | Descargar reporte PDF |
| POST | `/auditorias/:auditoriaId/facturas` | Subir y analizar una factura |
| GET | `/auditorias/:auditoriaId/facturas` | Listar facturas de una auditoría |
| POST | `/facturas/:id/confirmar` | Confirmar factura y calcular emisión |
| POST | `/chat/:auditoriaId` | Enviar mensaje al asistente conversacional |
| GET | `/chat/:auditoriaId/historial` | Historial de mensajes de una auditoría |

## Notas y limitaciones del prototipo

- Los **factores de emisión** (`src/data/factoresEmision.json`) son orientativos; para uso
  productivo deben validarse contra fuentes oficiales vigentes (Secretaría de Energía, IPCC, IEA).
- El manejo de PDFs escaneados sin texto embebido está limitado en este prototipo (no se
  rasterizan páginas a imagen); se recomienda subir el archivo como imagen (foto/escaneo) en esos casos.
- El modelo de visión (`GROQ_VISION_MODEL`) y el de texto (`GROQ_MODEL`) son configurables por
  variable de entorno; revisar la documentación de Groq por si los nombres de modelo cambiaron.
- Este es un prototipo educativo/demo: no reemplaza una auditoría de sostenibilidad certificada.
