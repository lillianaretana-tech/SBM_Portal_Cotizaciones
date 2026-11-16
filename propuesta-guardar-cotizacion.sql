-- Probar esta función en una base aislada antes de desplegarla.
CREATE FUNCTION public.cotizaciones_crear_desde_portal(p_cabecera jsonb, p_detalles jsonb)
RETURNS public.cotizaciones_registros
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fecha date := (p_cabecera->>'fecha')::date;
  v_anio integer := extract(year from v_fecha);
  v_numero text := trim(p_cabecera->>'consecutivo');
  v_normalizado text := upper(regexp_replace(v_numero, '[^a-zA-Z0-9]', '', 'g'));
  v_huella text := 'portal:' || encode(sha256(convert_to(jsonb_build_array(p_cabecera, p_detalles)::text, 'UTF8')), 'hex');
  v_registro public.cotizaciones_registros;
BEGIN
  IF v_uid IS NULL OR v_fecha IS NULL OR coalesce(v_normalizado, '') = '' THEN
    RAISE EXCEPTION 'Se requieren sesión, fecha y consecutivo.';
  END IF;
  IF jsonb_typeof(p_detalles) IS DISTINCT FROM 'array' OR jsonb_array_length(p_detalles) = 0 THEN
    RAISE EXCEPTION 'La cotización requiere renglones.';
  END IF;

  INSERT INTO public.cotizaciones_registros (
    usuario_id, anio, consecutivo, fecha_cotizacion, proyecto, cliente, descripcion,
    tipo, mes_reporte, anio_reporte, costo_mano_obra, horas, administracion,
    precio_sin_iva, iva_porcentaje, precio_con_iva, observaciones, archivo_origen, hash_archivo
  ) VALUES (
    v_uid, v_anio, v_numero, v_fecha, p_cabecera->>'proyecto', p_cabecera->>'cliente',
    p_cabecera->>'descripcion', p_cabecera->>'tipo', extract(month from v_fecha), v_anio,
    (p_cabecera->>'mano_obra')::numeric, (p_cabecera->>'horas')::numeric,
    (p_cabecera->>'administracion')::numeric, (p_cabecera->>'sin_iva')::numeric,
    (p_cabecera->>'iva_porcentaje')::numeric, (p_cabecera->>'con_iva')::numeric,
    p_cabecera->>'observaciones', 'Creada en portal', v_huella
  )
  ON CONFLICT (usuario_id, anio, consecutivo_normalizado) DO NOTHING
  RETURNING * INTO v_registro;

  IF NOT FOUND THEN
    SELECT * INTO v_registro FROM public.cotizaciones_registros
    WHERE usuario_id = v_uid AND anio = v_anio AND consecutivo_normalizado = v_normalizado;
    IF NOT FOUND OR v_registro.hash_archivo IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'Ya existe una cotización con ese consecutivo. Ábrela desde Registros.';
    END IF;
    RETURN v_registro;
  END IF;

  INSERT INTO public.cotizaciones_detalles (
    usuario_id, cotizacion_id, orden, clase, descripcion, puesto, cantidad, precio_unitario, subtotal, datos_extra
  )
  SELECT v_uid, v_registro.id, ord, item->>'clase', item->>'descripcion', item->>'puesto',
         (item->>'cantidad')::numeric, (item->>'precio_unitario')::numeric,
         (item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric,
         coalesce(item->'datos_extra', '{}'::jsonb)
  FROM jsonb_array_elements(p_detalles) WITH ORDINALITY AS lines(item, ord);

  RETURN v_registro;
END;
$$;
REVOKE ALL ON FUNCTION public.cotizaciones_crear_desde_portal(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cotizaciones_crear_desde_portal(jsonb, jsonb) TO authenticated;
