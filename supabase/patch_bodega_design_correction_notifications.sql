-- Notificaciones a diseñadora cuando el supervisor marca piezas por corregir.
-- Requiere: patch_app_notifications.sql + patch_bodega_partial_design_review.sql
-- Ejecuta en Supabase → SQL Editor y recarga el esquema API.

create or replace function public.bodega_resolve_design_piece_review(
  p_design_version_id uuid,
  p_reviews jsonb,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
  v record;
  rev record;
  n_approved int := 0;
  n_rejected int := 0;
  n_total int := 0;
  n_proj_approved int := 0;
  n_proj_rejected int := 0;
  new_version_status text;
  new_project_status text;
  piece_id uuid;
  piece_label text;
  rnd int;
  path_norm text;
  st text;
  rejected_pieces jsonb := '[]'::jsonb;
  actor_name text;
  notif_title text;
  notif_body text;
  idx int;
  piece_fb text;
begin
  r := public.my_role();
  if r not in ('admin', 'encargado') then
    raise exception 'Solo supervisor (admin o encargado) puede resolver la revisión de diseño';
  end if;

  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array' or jsonb_array_length(p_reviews) < 1 then
    raise exception 'Indica el resultado de revisión para al menos una pieza';
  end if;

  select
    d.*,
    p.status as project_status,
    p.folio as project_folio,
    p.nombre as project_nombre
  into v
  from public.project_design_versions d
  join public.bodega_projects p on p.id = d.project_id
  where d.id = p_design_version_id
    and d.package_category = 'entrega_diseno';

  if not found then
    raise exception 'Versión de diseño no encontrada';
  end if;

  if v.status <> 'en_revision' then
    raise exception 'Esta versión ya fue revisada (estado: %)', v.status;
  end if;

  rnd := v.version;
  st := v.project_status;

  for rev in
    select *
    from jsonb_to_recordset(p_reviews) as x(
      source_path text,
      status text,
      feedback text
    )
  loop
    path_norm := trim(replace(coalesce(rev.source_path, ''), E'\\', '/'));
    if path_norm = '' then
      raise exception 'Ruta de pieza vacía en la revisión';
    end if;
    if rev.status not in ('aprobada', 'requiere_cambios') then
      raise exception 'Estado inválido para %: %', path_norm, rev.status;
    end if;
    if rev.status = 'requiere_cambios' and nullif(trim(coalesce(rev.feedback, '')), '') is null then
      raise exception 'Indica el motivo de corrección para: %', path_norm;
    end if;

    n_total := n_total + 1;
    if rev.status = 'aprobada' then
      n_approved := n_approved + 1;
    else
      n_rejected := n_rejected + 1;
    end if;

    piece_label := regexp_replace(path_norm, '^.*/', '');
    if piece_label = '' then
      piece_label := path_norm;
    end if;
    piece_label := regexp_replace(piece_label, '\.[^.]+$', '');

    if rev.status = 'requiere_cambios' then
      rejected_pieces := rejected_pieces || jsonb_build_array(
        jsonb_build_object(
          'source_path', path_norm,
          'label', piece_label,
          'feedback', nullif(trim(coalesce(rev.feedback, '')), '')
        )
      );
    end if;

    select bp.id into piece_id
    from public.bodega_project_pieces bp
    where bp.project_id = v.project_id
      and bp.source_path = path_norm;

    if piece_id is null then
      insert into public.bodega_project_pieces (
        project_id, label, source_path, design_status,
        design_approved_at, design_approved_from_version, design_correction_round,
        supervisor_design_feedback
      ) values (
        v.project_id,
        piece_label,
        path_norm,
        rev.status,
        case when rev.status = 'aprobada' then now() else null end,
        case when rev.status = 'aprobada' then v.version else null end,
        rnd,
        case when rev.status = 'requiere_cambios' then nullif(trim(rev.feedback), '') else null end
      )
      returning id into piece_id;
    else
      update public.bodega_project_pieces
      set
        design_status = rev.status,
        design_approved_at = case when rev.status = 'aprobada' then now() else null end,
        design_approved_from_version = case when rev.status = 'aprobada' then v.version else design_approved_from_version end,
        design_correction_round = rnd,
        supervisor_design_feedback = case
          when rev.status = 'requiere_cambios' then nullif(trim(rev.feedback), '')
          else supervisor_design_feedback
        end,
        updated_at = now()
      where id = piece_id;
    end if;

    insert into public.design_version_piece_reviews (
      design_version_id, project_id, source_path, piece_id,
      status, feedback, reviewed_by, correction_round
    ) values (
      p_design_version_id, v.project_id, path_norm, piece_id,
      rev.status, nullif(trim(coalesce(rev.feedback, '')), ''), auth.uid(), rnd
    );
  end loop;

  if n_approved = n_total then
    new_version_status := 'aprobada';
  elsif n_rejected = n_total then
    new_version_status := 'requiere_cambios';
  else
    new_version_status := 'aprobada_parcial';
  end if;

  select count(*) into n_proj_rejected
  from public.bodega_project_pieces bp
  where bp.project_id = v.project_id
    and bp.design_status = 'requiere_cambios';

  select count(*) into n_proj_approved
  from public.bodega_project_pieces bp
  where bp.project_id = v.project_id
    and bp.design_status = 'aprobada';

  if n_proj_rejected > 0 and n_proj_approved > 0 then
    new_project_status := 'diseno_parcial';
  elsif n_proj_rejected > 0 then
    new_project_status := 'modificacion_diseno';
  else
    new_project_status := 'diseno_aprobado';
  end if;

  if new_project_status = 'diseno_aprobado' then
    new_version_status := 'aprobada';
  elsif new_project_status = 'diseno_parcial' and new_version_status = 'aprobada' then
    new_version_status := 'aprobada_parcial';
  end if;

  update public.project_design_versions
  set
    status = new_version_status,
    comentarios = coalesce(nullif(trim(p_comment), ''), comentarios)
  where id = p_design_version_id;

  update public.bodega_projects
  set status = new_project_status, updated_at = now()
  where id = v.project_id;

  update public.project_design_versions
  set
    status = 'subida',
    comentarios = coalesce(comentarios, '') || case
      when comentarios is null or trim(comentarios) = '' then 'Cerrada al resolver versión ' || v.version::text
      else ' · Cerrada al resolver versión ' || v.version::text
    end
  where project_id = v.project_id
    and package_category = 'entrega_diseno'
    and status = 'en_revision'
    and id <> p_design_version_id;

  if n_proj_rejected > 0 then
    perform public.bodega_work_interval_open_design(
      v.project_id,
      now(),
      jsonb_build_object(
        'opened_by', 'design_partial_review',
        'phase', 'correccion',
        'correction_round', rnd,
        'pieces_pending', n_proj_rejected,
        'pieces_approved', n_proj_approved,
        'design_version_id', p_design_version_id
      )
    );
  elsif new_project_status = 'diseno_aprobado' then
    perform public.bodega_work_interval_close_open(
      v.project_id,
      'diseno',
      now(),
      jsonb_build_object(
        'closed_by', 'design_fully_approved',
        'design_version_id', p_design_version_id
      )
    );
  end if;

  -- Notificar diseñadoras: piezas marcadas en esta revisión
  if n_rejected > 0 then
    begin
      select coalesce(nullif(trim(pr.username), ''), 'Supervisor')
      into actor_name
      from public.profiles pr
      where pr.id = auth.uid();

      notif_title := case
        when new_project_status = 'diseno_parcial' then
          format(
            'Corregir %s pieza(s) — %s',
            n_rejected,
            coalesce(nullif(trim(v.project_folio), ''), 'proyecto')
          )
        else
          format(
            'Corregir diseño — %s',
            coalesce(nullif(trim(v.project_folio), ''), 'proyecto')
          )
      end;

      notif_body := format(
        '%s revisó la entrega V%s de «%s».',
        actor_name,
        v.version,
        coalesce(nullif(trim(v.project_nombre), ''), nullif(trim(v.project_folio), ''), 'proyecto')
      );

      if nullif(trim(coalesce(p_comment, '')), '') is not null then
        notif_body := notif_body || E'\n\nComentario general: ' || trim(p_comment);
      end if;

      notif_body := notif_body || E'\n\nPiezas por corregir:';

      for idx in 0 .. (jsonb_array_length(rejected_pieces) - 1) loop
        piece_fb := coalesce(
          nullif(trim(rejected_pieces->idx->>'feedback'), ''),
          'Revisar diseño'
        );
        notif_body := notif_body || E'\n• '
          || coalesce(nullif(trim(rejected_pieces->idx->>'label'), ''), rejected_pieces->idx->>'source_path', 'Pieza')
          || ': '
          || piece_fb;
      end loop;

      if new_project_status = 'diseno_parcial' then
        notif_body := notif_body || E'\n\nLas demás piezas de esta entrega ya fueron aprobadas.';
      end if;

      insert into public.app_notifications (user_id, kind, title, body, payload)
      select
        pr.id,
        'bodega_design_correccion',
        notif_title,
        notif_body,
        jsonb_build_object(
          'project_id', v.project_id,
          'folio', v.project_folio,
          'proyecto_nombre', v.project_nombre,
          'design_version', v.version,
          'project_status', new_project_status,
          'pieces_to_correct', rejected_pieces,
          'rejected_count', n_rejected,
          'approved_count', n_approved,
          'actor_username', actor_name,
          'tab', 'diseno'
        )
      from public.profiles pr
      where pr.role = 'disenadora'
        and pr.id is distinct from auth.uid();
    exception
      when undefined_table then
        null;
    end;
  end if;

  insert into public.project_activity (project_id, actor_id, type, payload)
  values (
    v.project_id,
    auth.uid(),
    case
      when new_version_status = 'aprobada' then 'design_approved'
      when new_version_status = 'requiere_cambios' then 'design_revision_requested'
      else 'design_partial_review'
    end,
    jsonb_build_object(
      'version', v.version,
      'design_version_id', p_design_version_id,
      'approved_count', n_approved,
      'rejected_count', n_rejected,
      'total_count', n_total,
      'version_status', new_version_status,
      'project_status', new_project_status,
      'comment', nullif(trim(coalesce(p_comment, '')), ''),
      'pieces_to_correct', rejected_pieces
    )
  );

  insert into public.project_activity (project_id, actor_id, type, payload)
  values (
    v.project_id,
    auth.uid(),
    'status_changed',
    jsonb_build_object(
      'status', new_project_status,
      'comment', nullif(trim(coalesce(p_comment, '')), ''),
      'design_version_id', p_design_version_id
    )
  );

  return jsonb_build_object(
    'approved_count', n_approved,
    'rejected_count', n_rejected,
    'version_status', new_version_status,
    'project_status', new_project_status
  );
end;
$$;

grant execute on function public.bodega_resolve_design_piece_review(uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
