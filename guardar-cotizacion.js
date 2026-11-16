async function guardarCotizacionCreada(comercial) {
  if (!cloudUser || !cloudClient) throw Error('Inicia sesión para guardar la cotización.');
  const {d, labor, fee, admin, sub, vat, total, issuer, fx, currency, view} = comercial;
  const consecutivo = cEl('cNumber').value.trim();
  if (!norm(consecutivo)) throw Error('Indica un consecutivo válido.');
  if (historicoCoincide(consecutivo)) throw Error('El consecutivo pertenece al histórico oficial.');

  const personal = cEl('cType').value === 'labor' ? v21LaborRows() : [];
  const detalles = [
    ...d.items.map(x => ({
      clase: 'suministro', descripcion: x.desc, cantidad: x.qty, precio_unitario: x.unit,
    })),
    ...personal.map(x => ({
      clase: 'mano_obra', descripcion: x.name, puesto: x.name,
      cantidad: x.qty * x.hours, precio_unitario: x.rate,
      datos_extra: {job: x.job, qty: x.qty, hours: x.hours, hourType: x.hourType, shift: x.shift},
    })),
  ];
  if (!detalles.length || detalles.some(x => !x.descripcion.trim() ||
    !Number.isFinite(x.cantidad) || x.cantidad <= 0 ||
    !Number.isFinite(x.precio_unitario) || x.precio_unitario <= 0)) {
    throw Error('Revisa las descripciones, cantidades y precios de los renglones.');
  }
  detalles[0].datos_extra = {
    ...detalles[0].datos_extra,
    v29_origen: {
      formato: personal.length ? 'COM-F-04' : 'COM-F-06',
      direccion: cEl('cAddress').value.trim(), emisor: issuer,
      precio_cliente: sub, costo_interno: comercial.base,
      administracion: admin, iva: comercial.tax, total_original: total,
      comision_porcentaje: fee, iva_porcentaje: vat, tipo_cambio: fx,
      moneda: currency, vista: view,
    },
  };
  const {data, error} = await cloudClient.rpc('cotizaciones_crear_desde_portal', {
    p_cabecera: {
      consecutivo, fecha: d.date, proyecto: d.site, descripcion: d.desc,
      cliente: cEl('cClient').value.trim(), observaciones: cEl('cNotes').value.trim(),
      tipo: personal.length ? 'mano_obra' : 'suministros',
      horas: personal.reduce((sum, x) => sum + x.qty * x.hours, 0),
      mano_obra: labor, administracion: admin, sin_iva: sub,
      iva_porcentaje: vat, con_iva: total,
    },
    p_detalles: detalles,
  });
  if (error) throw Error(error.message);
  if (!data?.id) throw Error('No se pudo confirmar el guardado. Consulta Registros.');
  const registro = fromDb(data);
  records = [...records.filter(x => x.id !== registro.id), registro];
  refresh();
}
