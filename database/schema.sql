-- OOH Media Inventory Database Schema

DROP TABLE IF EXISTS inventory;

CREATE TABLE inventory (
    id INTEGER PRIMARY KEY,
    taxonomia TEXT NOT NULL,
    regional_boticario TEXT,
    uf TEXT NOT NULL,
    praca TEXT NOT NULL,
    cluster_exibidores TEXT,
    exibidores TEXT NOT NULL,
    cluster_formato TEXT,
    formato TEXT NOT NULL,
    estatico INTEGER NOT NULL DEFAULT 0,
    digital INTEGER NOT NULL DEFAULT 0,
    range_minimo INTEGER,
    range_maximo INTEGER,
    quantidade INTEGER,
    periodicidade TEXT,
    s1 INTEGER DEFAULT 0,
    s2 INTEGER DEFAULT 0,
    s3 INTEGER DEFAULT 0,
    s4 INTEGER DEFAULT 0,
    flight INTEGER DEFAULT 1,
    unitario_bruto_tabela REAL NOT NULL,
    desconto REAL DEFAULT 0,
    unitario_bruto_negociado REAL,
    total_bruto_negociado REAL,
    -- Campos para indicadores (quando disponíveis)
    impacto_unit REAL,
    exposicao_unit REAL
);

-- Índices para melhorar performance de queries
CREATE INDEX idx_uf ON inventory(uf);
CREATE INDEX idx_praca ON inventory(praca);
CREATE INDEX idx_taxonomia ON inventory(taxonomia);
CREATE INDEX idx_exibidores ON inventory(exibidores);
CREATE INDEX idx_formato ON inventory(formato);
CREATE INDEX idx_digital ON inventory(digital);
CREATE INDEX idx_estatico ON inventory(estatico);

-- Índice composto para filtros combinados
CREATE INDEX idx_filters ON inventory(uf, praca, taxonomia, formato);
