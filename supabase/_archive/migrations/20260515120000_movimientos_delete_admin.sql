-- Permite que un admin borre movimientos (p. ej. antes de eliminar un producto o limpiar historial).
-- Sin esto, el DELETE en `movimientos` queda bloqueado por RLS aunque exista FK en cascada.

drop policy if exists "movimientos_delete_admin" on public.movimientos;

create policy "movimientos_delete_admin"
  on public.movimientos for delete
  to authenticated
  using (public.is_admin());
