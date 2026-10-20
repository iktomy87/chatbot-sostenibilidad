-- Esquema de base de datos para el Auditor de Sostenibilidad en PostgreSQL

-- PostgreSQL nativo ya tiene gen_random_uuid() a partir de la versión 13,
-- por lo que no es estrictamente necesario habilitar "uuid-ossp", pero lo hacemos por compatibilidad.

-- 1. Empresas (PyMEs auditadas)
CREATE TABLE IF NOT EXISTS empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  sector text,
  region text DEFAULT 'Argentina',
  empleados integer,
  email_contacto text,
  telefono text,
  sitio_web text,
  superficie_m2 numeric,
  facturacion_anual numeric,
  tamaño_empresa text CHECK (tamaño_empresa IN ('micro', 'pequeña', 'mediana', 'grande', NULL)),
  creado_en timestamptz DEFAULT now()
);

-- 2. Auditorías (una auditoría agrupa el proceso de cálculo de huella de una empresa)
CREATE TABLE IF NOT EXISTS auditorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE,
  periodo text, -- ej: "2025-Q4" o "2025-Anual"
  estado text DEFAULT 'en_progreso' CHECK (estado IN ('en_progreso', 'completada')),
  total_co2_kg numeric DEFAULT 0,
  resumen jsonb DEFAULT '{}'::jsonb,
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now()
);

-- 3. Servicios de la Empresa
CREATE TABLE IF NOT EXISTS servicios_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nombre_servicio text NOT NULL,
  descripcion text,
  creado_en timestamptz DEFAULT now()
);

-- 4. Indicadores Sociales
CREATE TABLE IF NOT EXISTS indicadores_sociales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE,
  mujeres_liderazgo integer,
  porcentaje_diversidad numeric,
  horas_capacitacion_anual numeric,
  salario_minimo_vs_vital_movil numeric,
  creado_en timestamptz DEFAULT now()
);

-- 5. Facturas cargadas (electricidad, gas, combustible, agua, etc.)
CREATE TABLE IF NOT EXISTS facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid REFERENCES auditorias(id) ON DELETE CASCADE,
  categoria text NOT NULL, 
  nombre_archivo text,
  tipo_mime text,
  texto_extraido text,
  datos_estructurados jsonb DEFAULT '{}'::jsonb, -- {consumo, unidad, periodo_facturado, proveedor}
  confirmada boolean DEFAULT false,
  co2_kg numeric DEFAULT 0,
  creado_en timestamptz DEFAULT now()
);

-- 6. Registros de emisiones (cada cálculo individual, ligado o no a una factura)
CREATE TABLE IF NOT EXISTS emisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid REFERENCES auditorias(id) ON DELETE CASCADE,
  factura_id uuid REFERENCES facturas(id) ON DELETE SET NULL,
  categoria text NOT NULL,
  concepto text,
  consumo numeric,
  unidad text,
  factor_emision numeric,
  co2_kg numeric NOT NULL,
  origen text DEFAULT 'factura' CHECK (origen IN ('factura', 'chat', 'manual')),
  creado_en timestamptz DEFAULT now()
);

-- 7. Recomendaciones generadas para una auditoría
CREATE TABLE IF NOT EXISTS recomendaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid REFERENCES auditorias(id) ON DELETE CASCADE,
  categoria text,
  titulo text NOT NULL,
  descripcion text,
  impacto_estimado text CHECK (impacto_estimado IN ('alto', 'medio', 'bajo', NULL)),
  creado_en timestamptz DEFAULT now()
);

-- 8. Historial de conversación del chat por auditoría
CREATE TABLE IF NOT EXISTS mensajes_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid REFERENCES auditorias(id) ON DELETE CASCADE,
  rol text NOT NULL CHECK (rol IN ('user', 'assistant', 'system')),
  contenido text,
  creado_en timestamptz DEFAULT now()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_auditorias_empresa ON auditorias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_facturas_auditoria ON facturas(auditoria_id);
CREATE INDEX IF NOT EXISTS idx_emisiones_auditoria ON emisiones(auditoria_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_auditoria ON mensajes_chat(auditoria_id);
CREATE INDEX IF NOT EXISTS idx_servicios_empresa ON servicios_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_indicadores_empresa ON indicadores_sociales(empresa_id);
