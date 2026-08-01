-- Execute somente depois de criar o primeiro usuário no Supabase Auth.
-- Substitua o e-mail abaixo pelo e-mail real do administrador.

update public.usuarios
set perfil_id = 'administrador',
    ativo = true,
    atualizado_em = now()
where lower(email::text) = lower('SEU_EMAIL@EMPRESA.COM.BR');

select id, nome, email, perfil_id, ativo
from public.usuarios
where lower(email::text) = lower('SEU_EMAIL@EMPRESA.COM.BR');
