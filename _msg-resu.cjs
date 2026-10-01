Hotel: resultados reestructurada desde el diseno Kuaida + mapa con drawer

- results.html del Kuaida traducido a RN: TopBar y buscador fijos, chips de
  filtro, orden, esqueleto de carga, vacio con accion y FAB Ver en mapa.
- Mapa real en drawer del 70%: pins de precio solo para hoteles con lat/lng
  del servidor, fitBounds al abrir, tira de mini-tarjetas y tirador
  arrastrable (PanResponder por refs, no estado del render).
- Valoracion/distancia/orden se aplican en cliente: el DTO de busqueda no
  los admite (sort responde 400). Amenities se cae: HotelSummary no trae
  servicios. Documentado en docs/KUAIDA-V12-AUDITORIA.md.
- Fuera del diseno: conversor EUR/USD, TabBar del prototipo y burbujas de
  demo; precios en formato de la app (45 000 XAF, sufijo).
