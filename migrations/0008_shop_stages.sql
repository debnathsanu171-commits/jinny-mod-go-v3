-- Factory shop-floor stages on each project (BOM → dispatch).
alter table projects add column if not exists stage_bom text not null default 'pending';
alter table projects add column if not exists stage_pasting text not null default 'pending';
alter table projects add column if not exists stage_cutting text not null default 'pending';
alter table projects add column if not exists stage_edgeband text not null default 'pending';
alter table projects add column if not exists stage_cnc text not null default 'pending';
alter table projects add column if not exists stage_qc text not null default 'pending';
