-- ============================================================================
-- PRIMEIRO ADMINISTRADOR
-- Execute somente DEPOIS de:
-- 1. Rodar INSTALACAO-COMPLETA-SUPABASE.sql;
-- 2. Criar o usuário em Supabase > Authentication > Users.
--
-- Troque o e-mail abaixo e execute todo este arquivo.
-- ============================================================================

select public.promover_administrador_por_email(
  'SEU_EMAIL@EMPRESA.COM.BR'
) as resultado;

select id, nome, email, perfil_id, ativo
from public.usuarios
where lower(email::text) = lower('SEU_EMAIL@EMPRESA.COM.BR');
