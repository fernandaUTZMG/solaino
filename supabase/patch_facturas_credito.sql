-- Facturas a credito. Solo admin y encargado.
-- Ejecutar en Supabase y recargar el esquema.

create table if not exists public.facturas_credito_proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  dias_credito integer,
  created_at timestamptz not null default now(),
  constraint facturas_credito_proveedores_nombre_unique unique (nombre),
  constraint facturas_credito_proveedores_dias_check check (dias_credito is null or dias_credito >= 0)
);

create table if not exists public.facturas_credito (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.facturas_credito_proveedores (id),
  descripcion text not null default '',
  factura text not null default '',
  monto_neto numeric(14,2),
  fecha_factura date,
  fecha_pago date,
  status text not null default 'PENDIENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facturas_credito_status_check check (status in ('PENDIENTE', 'VENCIDA', 'PAGADA'))
);

alter table public.facturas_credito_proveedores enable row level security;
alter table public.facturas_credito enable row level security;

drop policy if exists facturas_credito_proveedores_all on public.facturas_credito_proveedores;
drop policy if exists facturas_credito_all on public.facturas_credito;

create policy facturas_credito_proveedores_all on public.facturas_credito_proveedores
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

create policy facturas_credito_all on public.facturas_credito
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

insert into public.facturas_credito_proveedores (nombre, dias_credito) values
  ('JORGE FRANCISCO ASCENCIO RODRIGUEZ ( PYNAR)', 30),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', null),
  ('KINNEMAQ', 30),
  ('FERRETERIA MEGAVALLE', 7),
  ('FRANCISCO ISACC TORRES', 15),
  ('ISACC TORRES', 15),
  ('MEGAVALLE', 7),
  ('FERRTERIA MEGAVALLE', 7),
  ('PYNAR NEUMATICA', 30),
  ('JAVIER ALEJANDRO CONCHAS ( TECNOMAQ )', 7)
on conflict (nombre) do update set dias_credito = excluded.dias_credito;

insert into public.facturas_credito (proveedor_id, descripcion, factura, monto_neto, fecha_factura, fecha_pago, status)
select p.id, v.descripcion, v.factura, v.monto, v.fecha_factura, v.fecha_pago, v.status
from (values
  ('JORGE FRANCISCO ASCENCIO RODRIGUEZ ( PYNAR)', 'PISTON Y ACCESORIOS MAQUINA DE PREFORME', '111', 1726.8, null::date, '2025-08-25'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'HERRAMIENTAS', '24864', 2809, null::date, '2025-08-14'::date, 'PAGADA'),
  ('KINNEMAQ', 'MAQUINA DE PREFORME', '331', 15080, null::date, '2025-09-04'::date, 'PAGADA'),
  ('KINNEMAQ', 'PLACAS DE PRERFORME', '332', 6032, null::date, '2025-09-04'::date, 'PAGADA'),
  ('KINNEMAQ', 'KIT DE REFACCIONES ARMADO DE PRESSFITMOD. TITAN TOP Y BOTOM,DADO Y ALMA', '330', 14070.8, null::date, '2028-08-28'::date, 'PAGADA'),
  ('KINNEMAQ', 'COMPUTADORA', '329', 6728, null::date, '2025-08-23'::date, 'PAGADA'),
  ('KINNEMAQ', 'MESA DE TRABAJO', '328', 24220, null::date, '2025-08-23'::date, 'PAGADA'),
  ('KINNEMAQ', 'PRESSFIT MOD. SOL25023', '327', 18838.4, null::date, '2025-08-23'::date, 'PAGADA'),
  ('KINNEMAQ', 'CORTADORES', '326', 1964.58, null::date, '2025-08-23'::date, 'PAGADA'),
  ('KINNEMAQ', 'CORTADORES', '325', 6579.52, null::date, '2025-08-23'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'PEGAMENTO AMARILLO,CINTA TRASNPARENTE,BROCHA', '62874', 315, null::date, '2025-08-08'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'GUANTES,LENTES SEG, PALA,AFLOJATODO,EXTENCION', '63115', 513, null::date, '2025-08-08'::date, 'PAGADA'),
  ('FRANCISCO ISACC TORRES', 'RETRABAJO DE PRESSFIT MOD. GRANT24/48', '8d94de03-aca3-47fe-aaf6-0fce036b9e07', 556.54, null::date, '2025-08-22'::date, 'PAGADA'),
  ('FRANCISCO ISACC TORRES', 'ESCUADRE DE DADOS PRESSFIT MOD. HILLE SIDE', '727b5409-961b-4bbc-8cd2-76467cdcfa03', 206.55, null::date, '2025-08-22'::date, 'PAGADA'),
  ('FRANCISCO ISACC TORRES', 'ESCUADRE Y BARRENADO DE SOPOERTES Y DADOS PRESSFIT MOD. 176 TOP Y BOTTOM', '38240bd8-d8da-4a02-ab72-ed7e4f2ef9ad', 1000.8, null::date, '2025-08-22'::date, 'PAGADA'),
  ('FRANCISCO ISACC TORRES', 'ACCESORIOS PRESSFIT ( 3 JUEGOS )', 'ae03a356-38a7-4ff6-8bc8-52262a770b6e', 7062.86, null::date, '2025-08-22'::date, 'PAGADA'),
  ('FRANCISCO ISACC TORRES', 'ESCUADRE Y BARRENADO DE SOPORTES Y DADO PRESSFIT MOD. 186', 'c1926d00-2418-41d2-9ee9-72d27f233127', 527.85, null::date, '2025-08-22'::date, 'PAGADA'),
  ('FRANCISCO ISACC TORRES', 'SOPORTES,PINES,BUJES BARREANDO DE SOPORTES,CONTRAMASCARA BASE', 'ee93a4cd-2d27-4c9f-978e-c01c83b7a1a9', 1055.69, null::date, '2025-08-22'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS PRESSFIT MOD. WEDGE LADO TOP', '( Folio 1 )c8c1ad23-c485-4cc2-a752-b1080646b84c', 5599.8, null::date, '2025-09-19'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS PRESSFIT MOD. WEDGE LADO BOTTOM', '( Folio 2 )ec77bdf9-9a37-4de0-826c-a2ca0659ce58', 3683.47, null::date, '2025-09-19'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'BROCAS', '25917', 399, null::date, '2025-10-11'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'RUEDAS AFILADORA', '26007', 4160, null::date, '2025-10-17'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'RUEDAS AFILADORA', '26038', 2080, null::date, '2025-10-19'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS PRESSFIT MOD. 176 BOTTOM', 'Folio 3 ca8073ed-88d7-49ee-9334-aae4f00f1929', 3771.26, null::date, '2025-10-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS PRESSFIT MOD. 176 TOP', 'Folio 4 bc6d5490-ff90-4a7c-b4e1-474c00cdee20', 3775.26, null::date, '2025-10-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS PRESSFIT MOD. HILLSIDE', 'Folio 5 0e23b473-035b-4ba0-b79e-ae615947e89a', 2134.34, null::date, '2025-10-10'::date, 'PAGADA'),
  ('KINNEMAQ', 'PLACA DE PREFORME', '335', 3828, null::date, '2024-10-30'::date, 'PAGADA'),
  ('KINNEMAQ', 'PRESSFIT MOD. SOL25034', '336', 29928, null::date, '2025-10-30'::date, 'PAGADA'),
  ('KINNEMAQ', 'DADO DE PREFORME', '337', 7656, null::date, '2025-10-30'::date, 'PAGADA'),
  ('KINNEMAQ', 'DADO DE PREFORME', '338', 5916, null::date, '2025-10-30'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'RIMA DE 4 MM', '26095', 280, null::date, '2025-10-23'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'BROCAS VARIAS', '26220', 798, null::date, '2025-10-30'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'ACCESORIOS', '64095', 369.5, null::date, '2025-10-10'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'ACCESORIOS', '64291', 270, null::date, '2025-10-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'RACK', 'Folio 6 148876a7-a96a-4d1d-9eb4-78ac67ff3f61', 6655.5, null::date, '2025-09-25'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS PRESSFIT MOD. NIKKA', 'Folio 9 a2e93299-fe2b-492e-bd83-c6dcddb4ba66', 5949.78, null::date, '2024-10-24'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS ALINEADORES MOD. NIKKA', 'Folio 10 16c18ae3-8449-4bcd-bccb-a7ba4a1e2d17', 1422.9, null::date, '2025-10-24'::date, 'PAGADA'),
  ('ISACC TORRES', 'RACK', 'Folio 11 e0750e59-463f-44e9-97c1-22bb7b17b8f7', 6655.5, null::date, '2025-10-24'::date, 'PAGADA'),
  ('MEGAVALLE', 'ACCESORIOS', '64643', 753.48, '2025-10-22'::date, '2025-10-24'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT GRANT 24/48', 'Folio 12 dead2cfd-f1c5-4b72-93e5-26a6a973e140', 5938.3, '2025-10-21'::date, '2025-10-31'::date, 'PAGADA'),
  ('ISACC TORRES', 'ALINEADORES MOD. GRANT 24/48', 'Folio 13 608affa-d669-4807-b065-9a967ac029e6', 1193.4, '2025-10-21'::date, '2025-10-31'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. BANZAI', 'Folio 14 8CE4F1F2-5F33-400D-A237-968B0636D668', 5020.3, '2025-10-21'::date, '2025-10-31'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD.TRIPEL', 'Folio 15 83fffdb9-2442-4f11-8994-124a84c070c5', 5100.62, '2025-10-28'::date, '2025-11-14'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. 183', 'FOLIO 16 18d15edc-1c22-4be2-a835-2c7ad6a05073', 4251.48, '2025-11-13'::date, '2025-11-28'::date, 'PAGADA'),
  ('ISACC TORRES', 'RETRABAJO PRESSFIT MOD.TITAN', 'FOLIO 17 089ee9f7-3f4c-467a-b74a-10e36a696a0e', 3832.65, '2025-11-13'::date, '2025-11-28'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'TRAPOS, LLAVES ALLEN', '65132', 1459.5, '2025-11-19'::date, '2025-11-28'::date, 'PAGADA'),
  ('JORGE FRANCISCO ASCENCIO RODRIGUEZ ( PYNAR)', 'MANGUERA 10 MM ( 10 MTS )', '167', 522, '2025-11-26'::date, '2025-12-26'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSSFIT MOD. TRAPISST HD', 'FOLIO 22 8784b788-7a66-4855-bf17-bc7ff81f4a74', 6064.52, '2025-12-01'::date, '2025-12-12'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSSFIT MOD. TRAPISST', 'FOLIO 23 61d47187-a0e6-4d54-9879-ea90d7fc73c5', 4027.71, '2025-12-01'::date, '2025-12-12'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'DISCO DE LIJA,SEGUETA CALADORA,THINNER', '65456', 153, '2025-12-04'::date, '2025-12-05'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'AVELLANADORES DE 1/4" Y 3/8"', '27483', 984, '2025-12-09'::date, '2026-01-09'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. GOOSE ISLAND', 'FOLIO 24  7e52f665-bde2-4ed0-b4f0-798415c3929e', 4917.02, '2025-12-19'::date, '2026-01-02'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. GFC BOTTOM', 'FOLIO 25  4c32ee36-b64f-4e75-86bf-8a1a1aa8a98f', 5198.16, '2025-12-19'::date, '2026-01-02'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. GFC RETRABAJO', 'FOLIO 26  dc1a9617-3462-4061-9ae1-2f68a0413cb6', 6328.45, '2025-12-22'::date, '2026-01-02'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'THINNER, DISCO DE LIJA, FIBRA VERDE', '65939', 192, '2026-01-06'::date, '2026-01-09'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'BROCAS', '27665', 132, '2025-12-18'::date, '2026-01-18'::date, 'PAGADA'),
  ('ISACC TORRES', 'RETRABAJO PRESSFIT MOD. GFC', 'FOLIO 32   418291b8-a35f-495e-a9bd-fd81772644cc', 2111.39, '2026-01-23'::date, '2026-02-06'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. PAULANER TOP-BOTTOM', 'FOLIO 33    79847c05-ff8c-44ab-abe1-6a8fd46cae51', 7510.39, '2026-01-23'::date, '2026-02-06'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'CUTTER,PEGAMENTO AMARILLO,THINNER,KOLALOKA', '66817', 316.6, '2026-03-02'::date, '2026-02-13'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'MACHUELO,BROCAS', '28530', 780, '2026-02-18'::date, '2026-03-19'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'RIMA 3 MM,BROCA PARA RIMA', '28532', 330, '2026-02-19'::date, '2026-03-19'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'BROCA NO.65 PARA RIMA DE 4', '28536', 150, '2026-02-19'::date, '2026-03-19'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. 51-2000211-01', 'Folio 37  99e9cbb6-0f9a-4abe-83c6-63542b7d17b9', 4347.26, '2026-03-06'::date, '2026-03-20'::date, 'PAGADA'),
  ('ISACC TORRES', '2 PLACAS DE PREFORME', 'Folio 38  e1250d25-c8ea-4292-8268-41670cc76311', 2524.5, '2026-03-06'::date, '2026-03-20'::date, 'PAGADA'),
  ('ISACC TORRES', '6 ADAPTACIONES DE PUNTAS', 'Folio 39  00390b59-1ac5-428a-9831-da92a20c385a', 1377, '2026-03-06'::date, '2026-03-20'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'BOLSA BASURA,LOCTITE,PILAS', '66288', 686.54, '2026-01-24'::date, '2026-03-27'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'BOLSA BASURA, TAQUETE ARPON,RONDANA PLANA', '66632', 406.9, '2026-02-16'::date, '2026-02-20'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. 51-2000204-01', 'Folio 40  96087459-ad09-4740-953f-289dcdd0c02d', 6445.05, '2026-03-24'::date, '2026-04-03'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS PLACA DEK MOD. 51-2000204-01', 'Folio 41  4fc16500-0183-4adc-b01c-a0aeab913ed9', 929.47, '2026-03-24'::date, '2026-04-03'::date, 'PAGADA'),
  ('ISACC TORRES', 'BARRENADO DE BISAGRAS ROUETR MOD. 51-2000204-01', 'Folio 42  a28dfa53-7773-4c5e-b037-92dc60c29cd0', 183.6, '2026-03-24'::date, '2026-04-03'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. BASEBOARD', 'FOLIO 46  869cf8b0-c266-44a1-9496-995018947d2e', 3826.9, '2026-04-15'::date, '2026-04-29'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. TPU TOP', 'FOLIO 47  a46642df-d327-434f-89d2-563838f579a0', 4440.8, '2026-04-15'::date, '2026-04-29'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. TPU BOTTOM', 'FOLIO 48  7e172337-e9fe-48b3-8547-323a3f464b4f', 4440.8, '2026-04-15'::date, '2026-04-29'::date, 'PAGADA'),
  ('ISACC TORRES', 'EXTRACTORES DE PRESSFIT', 'FOLIO 49  f652ecc9-10c1-4782-bb54-c077bb11c330', 23581.11, '2026-04-15'::date, '2026-04-29'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS FIXTURE BASE EXTRACTORES', 'FOLIO 50  9da8b276-e1f5-42de-975b-4254e350a434', 3672, '2026-04-15'::date, '2026-04-29'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'ACEITE ISO 68 PARA GUIAS CNC', '29835', 1673, '2026-04-05'::date, '2026-06-05'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'AVELLANADOR DE 1/2 Y BROCAS', '30068', 1305, '2026-05-14'::date, '2026-06-14'::date, 'PAGADA'),
  ('ISACC TORRES', 'FIXTURE DE ATORNILLADO MOD. TPU', 'FOLIO 55  fe51ebaf-9ba1-487f-adcb-82d88f16575d', 2027.63, '2026-05-15'::date, '2026-05-29'::date, 'PAGADA'),
  ('ISACC TORRES', 'PRESSFIT MOD. TUP RETRABAJO', 'fOLIO 56  cd5c6c3e-fef1-4da6-a6e4-0e458ed5e583', 4968.66, '2026-05-15'::date, '2026-05-29'::date, 'PAGADA'),
  ('FERRTERIA MEGAVALLE', 'EMPLALLE, RAID,DISCO LIJA,PUNTA DE LIJA', '67967', 911.01, '2026-05-15'::date, '2026-05-22'::date, 'PAGADA'),
  ('FRANCISCO ISACC TORRES', 'DADO GUIA', 'FOLIO 59  e5eba629-1da7-41b1-9f69-7fd56b5a29e8', 11484, '2026-05-29'::date, '2026-06-12'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'CORTADOR DE 6 MM', '30504', 780, '2026-06-05'::date, '2026-07-06'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'TINNER,LIJAS,CUTER,SEGGUETA,TORNILLOS,SAPO BAÑO', '68581', 754, '2026-06-22'::date, '2026-06-26'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'CORTADOR DE 6 MM', '30883', 1200, '2026-06-26'::date, '2026-07-26'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'CORTADOR BOLA', '31017', 485, '2026-07-06'::date, '2026-08-06'::date, 'PAGADA'),
  ('PYNAR NEUMATICA', 'NEUMATICA FIXTURE', '257', 9877.4, '2026-06-29'::date, '2026-07-29'::date, 'PAGADA'),
  ('ISACC TORRES', 'EXTRACTOR DE PRESSFIT MOD. TPU', 'FOLIO 63  17353c2d-9b8c-4721-ae7c-ceb3e1c80883', 17901, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'EXTRACTOR DE PRESSFIT MOD. BASEBOARD', 'FOLIO 64  070a9312-d894-4e11-8071-c745b479b21d', 9512.77, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS LINEA 2 FIXTURE SUNENSAMBLE WYNDI MOD. SUNRISE', 'FOLIO 65  b3acdb3a-313d-469e-bc6d-580cb0d9f3fd', 619.65, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'BUJES LATON, SOPORTES LINEA 4 STIFFENER', 'FOLIO 66  b52e46eb-f432-454c-98ac-c87ca22a71de', 3304.8, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'BUJES LATON, SOPORTES LINEA 3 STIFFENER', 'FOLIO 67  bcd36aa2-39d9-49af-ad44-8163f66ade54', 6024.37, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'PERNOS LINEA 6 LABELING', 'FOLIO 68  60d8ec4f-bdb8-436d-9b3b-2caaf5184156', 229.5, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'BUJES Y PERNOS ROUTER MOD. CJ2063576-B1', 'FOLIO 69  82d76f25-0c6e-405e-8506-0dd94f372564', 1514.7, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'RANURADO DE SOPORTE LATERAL', 'FOLIO 70  f7fee9ae-2816-4001-8a66-2947d11fe376', 1836, '2026-06-30'::date, '2026-07-10'::date, 'PAGADA'),
  ('ISACC TORRES', 'RANURADO DE SOPORTE LATERAL', 'FOLIO 71  91cb2ad9-9e18-4ca8-a3fb-6b66531cdb38', 1950.75, '2026-07-15'::date, '2026-07-24'::date, 'PAGADA'),
  ('ISACC TORRES', 'SOPORTE LATERAL', 'FOLIO 72  150ea90c-ba9b-4d0b-88f8-26efa8cc54eb', 19920.6, '2026-07-15'::date, '2026-07-24'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'RONDANAS,DISCOS LIJA, FIBRA VERDE, TORNILLOS PARA CNC, AFLOJA TODO', '68991', 925, '2026-07-15'::date, '2026-07-17'::date, 'PAGADA'),
  ('KINNEMAQ', 'MAQUINADOS DE TOPE,BASE SUPERIOR Y SOPORTES LATERALES', '356', 57652, '2026-07-11'::date, '2026-08-11'::date, 'PAGADA'),
  ('KINNEMAQ', 'MAQUINADO BASE SUPERIO Y SOPORTES LATERALES', '357', 75168, '2026-07-17'::date, '2026-08-17'::date, 'PAGADA'),
  ('ISACC TORRES', 'SOPORTE LATERAL', 'FOLIO 73   1fd8fc8b-51b7-4490-ab0e-5c880a075147', 30110.4, '2026-07-22'::date, '2026-07-31'::date, 'PAGADA'),
  ('KINNEMAQ', 'MAQUINADOS DE TOPE,BASE SUPERIOR Y SOPORTES LATERALES', '358', 27561.6, '2026-07-27'::date, '2026-08-27'::date, 'PAGADA'),
  ('PYNAR NEUMATICA', 'NEUMATICA FIXTURE SUNRISE', '267', 13016.2, '2026-07-27'::date, '2026-08-27'::date, 'PAGADA'),
  ('PYNAR NEUMATICA', 'NEUMATICA FIXTURE ECLIPCE', '268', 23788.12, '2026-07-27'::date, '2026-08-27'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'MACHUELO M8X1.0', '31564', 179, '2026-07-30'::date, '2026-08-30'::date, 'PAGADA'),
  ('JAVIER ALEJANDRO CONCHAS ( TECNOMAQ )', 'SENSORES', '235', 7296, '2026-08-07'::date, '2026-08-07'::date, 'PAGADA'),
  ('FERRETERIA MEGAVALLE', 'MARCACDOR, SEGUETA,ARCO,CINCHOS,CONECTOR AIRE,CINTA AISLANTE ETC', '69411', 1897, '2026-08-07'::date, '2026-08-14'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS FIXTURE MOD. PCBA HEDEGHOG', 'FOLIO 79  8165a196-9e95-4911-abfb-5e258fbfc58c', 1193.4, '2026-08-07'::date, '2026-08-21'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS FIXTURE ECLIPCE', 'FOLIO 80  d160b9bb-fbae-468c-82fa-96755a37cbdf', 2983.5, '2026-08-07'::date, '2026-08-21'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS FIXTURE LINEA 3 STIFFENER', 'FOLIO 81  cc9ae05a-67d0-43f2-8ccf-b40f7bb9de34', 6024.37, '2026-08-07'::date, '2026-08-21'::date, 'PAGADA'),
  ('ISACC TORRES', 'ACCESORIOS FIXTURE LINEA 4 STIFFENER', 'FOLIO 82  243c4712-6978-4e3d-8a02-7dc23447891f', 3304.8, '2026-08-07'::date, '2026-08-21'::date, 'PAGADA'),
  ('ISACC TORRES', 'SOPORTE LATERAL', 'FOLIO 84  1b82c7ef-2d69-4b32-b11d-6776193cc6c2', 21529.6, '2026-08-13'::date, '2026-08-21'::date, 'PAGADA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'CORTADOR DE 6 MM', '31883', 1200, '2026-08-14'::date, '2026-09-14'::date, 'PAGADA'),
  ('JORGE FRANCISCO ASCENCIO RODRIGUEZ ( PYNAR)', 'SENSOR MAGNETICO', '281', 712.24, '2026-08-20'::date, '2026-09-20'::date, 'VENCIDA'),
  ('KINNEMAQ', 'SOPORTES LATERALES Y BASE SUPERIOR', '362', 118784, '2026-08-28'::date, '2026-09-28'::date, 'VENCIDA'),
  ('TADEO MOJICA GONZALEZ ( DHI HERRAMIENTAS)', 'PARALELAS CNC', '32158', 1020, '2026-08-31'::date, '2026-09-30'::date, 'VENCIDA'),
  ('KINNEMAQ', 'SOPORTES LATERALES Y BASE SUPERIOR', '363', 49462, '2026-02-09'::date, '2026-02-10'::date, 'VENCIDA'),
  ('JORGE FRANCISCO ASCENCIO RODRIGUEZ ( PYNAR)', 'CONECTOR T 6 MM', '287', 51.04, '2026-04-09'::date, '2026-04-10'::date, 'PENDIENTE'),
  ('JORGE FRANCISCO ASCENCIO RODRIGUEZ ( PYNAR)', 'SOPORTES LATERAS', '288', 480.24, '2026-04-09'::date, '2026-04-10'::date, 'PENDIENTE'),
  ('ISACC TORRES', 'SOPORTES LATERAS', 'FOLIO 85 d0cf9ea5-990c-442d-8a82-5a7f02c66aa7', 64260, '2026-08-09'::date, '2026-09-18'::date, 'VENCIDA'),
  ('JORGE FRANCISCO ASCENCIO RODRIGUEZ ( PYNAR)', 'VALVULA DE PARA DE EMERGENCIA', '291', 6593.44, '2026-09-17'::date, '2026-10-17'::date, 'PENDIENTE'),
  ('KINNEMAQ', 'BASE SUPERIOR', '366', 62640, '2026-09-22'::date, '2026-10-22'::date, 'PENDIENTE'),
  ('ISACC TORRES', 'PRESSFIT MOD. GOSHFISH', 'FOLIO 87  794F6B85-9964-42C2-B3E7-7A2BA84D90BE', 5978.47, '2026-09-23'::date, '2026-07-10'::date, 'PENDIENTE'),
  ('ISACC TORRES', 'PRESSFIT MOD. SUNFISH TOP', 'FOLIO 88 84d4a8-29a8-482f-8b0f-3a222e7e57e0', 5450.62, '2026-09-23'::date, '2026-07-10'::date, 'PENDIENTE'),
  ('ISACC TORRES', 'SOPORTES LATERALES', 'FOLIO 89  174f0532-0b57-4bbd-81ae-9292dfa8e1d4', 24499.2, '2026-09-23'::date, '2026-07-10'::date, 'PENDIENTE'),
  ('ISACC TORRES', 'SOPORTES LATERALES', 'FOLIO 92  96b0d889-e72d-477f-975e-31988ad50cab', 25704, '2026-01-10'::date, '2026-10-16'::date, 'PENDIENTE')
) as v(nombre, descripcion, factura, monto, fecha_factura, fecha_pago, status)
join public.facturas_credito_proveedores p on p.nombre = v.nombre
where not exists (select 1 from public.facturas_credito);

notify pgrst, 'reload schema';
