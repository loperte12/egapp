# Censo de lo que queda de C (difusión del kit)

Generado por `pruebas/censo-pendiente-C.js`. Zonas: app, components, core.

## 1. Archivos con su propio `<Modal>` (candidatos a `Sheet`)

Total: **50** archivos.

- [ ] app/alquiler.tsx
- [ ] app/conductor.tsx
- [ ] app/ecomerse-detail.tsx
- [ ] app/ecomerse-orders.tsx
- [ ] app/ecomerse-seller.tsx
- [ ] app/ecomerse.tsx
- [ ] app/edit-profile.tsx
- [ ] app/food-orders.tsx
- [ ] app/food-owner.tsx
- [ ] app/lifebook-ai.tsx
- [ ] app/lifebook-carrito.tsx
- [ ] app/lifebook-chat/[id].tsx
- [ ] app/lifebook-explore.tsx
- [ ] app/lifebook-groups.tsx
- [ ] app/lifebook-merchant-products.tsx
- [ ] app/lifebook-order/[id].tsx
- [ ] app/lifebook-post/[id].tsx
- [ ] app/lifebook-product/[id].tsx
- [ ] app/lifebook-user.tsx
- [ ] app/lifebook.tsx
- [ ] app/profile.tsx
- [ ] app/settings.tsx
- [ ] app/taxi.tsx
- [ ] app/work.tsx
- [ ] components/DriverHomeSheet.tsx
- [ ] components/EditProfileModal.tsx
- [ ] components/EmergencyModal.tsx
- [ ] components/lifebook/AdSheet.tsx
- [ ] components/lifebook/ChainSheet.tsx
- [ ] components/lifebook/ChallengePlazaSheet.tsx
- [ ] components/lifebook/ChatOptionsSheet.tsx
- [ ] components/lifebook/CheckinSheet.tsx
- [ ] components/lifebook/CommentsSheet.tsx
- [ ] components/lifebook/GroupCardSheet.tsx
- [ ] components/lifebook/GroupManageSheet.tsx
- [ ] components/lifebook/LocationPickerSheet.tsx
- [ ] components/lifebook/OrderSheet.tsx
- [ ] components/lifebook/ProductoEnChatSheet.tsx
- [ ] components/lifebook/publish/OptionGroupsEditor.tsx
- [ ] components/lifebook/ReportSheet.tsx
- [ ] components/lifebook/SelectorDeProductos.tsx
- [ ] components/lifebook/SelectorDeVariante.tsx
- [ ] components/lifebook/ui/Sheet.tsx
- [ ] components/lifebook/VideoCoverSheet.tsx
- [ ] components/lifebook/VoteSheet.tsx
- [ ] components/LocationModal.tsx
- [ ] components/ServiceGrid.tsx
- [ ] components/ServicesDrawer.tsx
- [ ] components/status/StatusDetailModal.tsx
- [ ] components/status/StatusEditorModal.tsx

## 2. Vacíos escritos a mano (candidatos a `EmptyState`)

Total: **68** sitios.

- [ ] app/alquiler-publicar.tsx:536  titulo="Aún no has publicado anuncios"
- [ ] app/billing-status.tsx:305  titulo="Todavía no has comprado nada"
- [ ] app/ecomerse-favorites.tsx:158  titulo={tab === 'bought' ? 'Todavía no has comprado nada' : tab === 'special' ? 'Sin productos e
- [ ] app/ecomerse-orders.tsx:197  titulo={role === 'seller' ? 'Aún no tienes ventas' : 'Todavía no has comprado'}
- [ ] app/ecomerse-planes.tsx:178  titulo="Todavía no tienes tienda"
- [ ] app/ecomerse.tsx:346  titulo: 'Todavía no hay productos',
- [ ] app/food-menu.tsx:148  titulo="Todavía no hay ítems en el menú"
- [ ] app/food-orders.tsx:367  {isOwner ? 'Aún no recibes pedidos' : 'Todavía no has pedido'}
- [ ] app/food-orders.tsx:453  No hay repartidores activos todavía. Aprueba uno desde el panel de administración.
- [ ] app/food-rider.tsx:380  Sin entregas asignadas todavía. Cuando un restaurante te asigne un pedido aparecerá aquí con el
- [ ] app/food.tsx:237  titulo={hasFilters ? 'Sin resultados con estos filtros' : 'Todavía no hay restaurantes'}
- [ ] app/intercity-publish.tsx:502  titulo="Aún no has publicado viajes"
- [ ] app/intercity.tsx:121  if (rs.length === 0) { setError('No hay rutas para esa combinación todavía'); return; }
- [ ] app/intercity.tsx:416  <Text style={{ color: colors.textSecondary, fontWeight: '700', textAlign: 'center' }}>No hay via
- [ ] app/lifebook-ai.tsx:367  if (!lista.length) { setError('Todavía no has guardado ningún producto.'); return; }
- [ ] app/lifebook-ai.tsx:521  ListEmptyComponent={<Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textA
- [ ] app/lifebook-carrito-checkout.tsx:369  No hay nada que pagar: vuelve al carrito y marca algún producto.
- [ ] app/lifebook-catalog.tsx:264  <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>Todavía no hay nada publicado aqu
- [ ] app/lifebook-guardados.tsx:114  titulo="Todavía no has guardado nada"
- [ ] app/lifebook-hotel-gestion.tsx:98  clave: 'sin-habitaciones', texto: 'Todavía no has creado ninguna habitación',
- [ ] app/lifebook-hotel-habitaciones.tsx:370  <Text style={{ color: colors.textPrimary, fontSize: 15.5, fontWeight: '900' }}>Todavía no tienes
- [ ] app/lifebook-hotel-perfil.tsx:111  if (!h) { setError('Todavía no tienes tienda. Créala en «Mi tienda» antes de configurar el aloja
- [ ] app/lifebook-hotel-reservas.tsx:275  {lado === 'guest' ? 'Todavía no has reservado ninguna estancia.' : 'Tu hotel no tiene reservas t
- [ ] app/lifebook-inbox-comments.tsx:116  titulo="Todavía no hay comentarios"
- [ ] app/lifebook-inbox-followers.tsx:102  return <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: 6
- [ ] app/lifebook-inbox-likes.tsx:90  titulo={tab === 'likes' ? 'Todavía no tienes me gusta' : 'Todavía no has guardado publicaciones'
- [ ] app/lifebook-inbox.tsx:172  Vacío con salida (D-17). Este era el PEOR ejemplo del informe: «Nada por aquí
- [ ] app/lifebook-inbox.tsx:184  ? 'Todavía no tienes me gusta ni guardados'
- [ ] app/lifebook-inbox.tsx:186  ? 'Todavía no tienes seguidores nuevos'
- [ ] app/lifebook-merchant-gestion.tsx:147  <Text style={{ color: colors.textPrimary, fontSize: 15.5, fontWeight: '900' }}>Todavía no tienes
- [ ] app/lifebook-merchant-settings.tsx:170  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '900' }}>Todavía no tienes t
- [ ] app/lifebook-merchant.tsx:206  : 'Todavía no has creado ninguna habitación'}
- [ ] app/lifebook-merchant.tsx:223  {/* Sin tienda: el panel no existe todavía, se ofrece abrirla. */}
- [ ] app/lifebook-merchant.tsx:227  <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: '900' }}>To
- [ ] app/lifebook-messages.tsx:270  : 'Aún no tienes conversaciones'}
- [ ] app/lifebook-orders.tsx:156  titulo={side === 'buyer' ? 'Aún no has comprado nada' : 'Aún no tienes ventas'}
- [ ] app/lifebook-search.tsx:478  Todavía no hay tendencias en tu ciudad.
- [ ] app/lifebook-videos.tsx:530  titulo="Todavía no hay vídeos aquí"
- [ ] app/lifebook-vistos.tsx:151  titulo="Todavía no has mirado nada"
- [ ] app/lifebook.tsx:91  'Todavía no hay publicaciones cerca de ti.\n¡Sé el primero en compartir algo!',
- [ ] app/lifebook.tsx:93  'Todavía no hay debates en esta ciudad.\nInicia uno sobre un problema del barrio.',
- [ ] app/lifebook.tsx:94  sales: 'No hay ventas por aquí todavía.\nPublica la primera.',
- [ ] app/lifebook.tsx:95  food: 'No hay publicaciones de comida todavía.',
- [ ] app/lifebook.tsx:96  taxi: 'No hay avisos de transporte todavía.',
- [ ] app/lifebook.tsx:97  work: 'No hay ofertas de trabajo publicadas todavía.',
- [ ] app/lifebook.tsx:98  rental: 'No hay anuncios de alquiler todavía.',
- [ ] app/lifebook.tsx:99  culture: 'No hay publicaciones de cultura todavía.',
- [ ] app/lifebook.tsx:100  music: 'No hay publicaciones de música todavía.',
- [ ] app/lifebook.tsx:101  sports: 'No hay publicaciones de deportes todavía.',
- [ ] app/lifebook.tsx:938  {EMPTY_COPY[channelId] ?? 'Todavía no hay publicaciones aquí.'}
- [ ] app/monedero-movimientos.tsx:147  titulo="Todavía no hay movimientos de este tipo"
- [ ] app/monedero.tsx:192  titulo="Todavía no hay movimientos"
- [ ] app/my-tickets.tsx:88  titulo="Todavía no tienes tickets"
- [ ] app/profile.tsx:198  if (which === 'seguidores') setEmptyStat('Aún no tienes seguidores · Cuando la comunidad crezca,
- [ ] app/profile.tsx:200  else setEmptyStat('Aún no tienes me gusta · Los me gusta de tus publicaciones aparecerán aquí.')
- [ ] app/profile.tsx:448  {lbTab === 'gustos' ? 'Aquí verás lo que guardes' : lbTab === 'ventas' ? 'Aún no tienes ventas' 
- [ ] app/taxi.tsx:1596  Sin modalidades para esta distancia todavía.
- [ ] app/trips-history.tsx:92  titulo="Todavía no tienes viajes"
- [ ] app/work-panel.tsx:307  Todavía no has publicado ninguna oferta
- [ ] app/work-publish.tsx:386  <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 30 }}>Aún no has pub
- [ ] app/work-publish.tsx:411  {(j.applicants ?? []).length === 0 && <Text style={{ fontSize: tipografia.caption, color: colors
- [ ] components/DriverHomeSheet.tsx:158  : 'Aún no tienes valoraciones suficientes.'}
- [ ] components/lifebook/ChallengePlazaSheet.tsx:197  Todavía no hay retos abiertos{filterCity ? ` en ${filterCity}` : ''}. ¡Crea el primero!
- [ ] components/lifebook/CommentsSheet.tsx:638  {allowComments ? 'Todavía no hay comentarios' : 'Los comentarios están desactivados'}
- [ ] components/lifebook/CommentsSheet.tsx:778  Todavía no has publicado nada.
- [ ] components/lifebook/messaging-sheets.tsx:59  {convos.length === 0 ? 'Todavía no tienes conversaciones.' : 'Nada coincide.'}
- [ ] components/lifebook/publish/OptionGroupsEditor.tsx:350  <Notice tone="error">Todavía no has subido fotos: vuelve al paso «Fotos» y súbelas (una por colo
- [ ] components/PhotoGallery.tsx:62  emptyLabel = 'Sin fotos todavía',

## 3. Ya usan el kit

- `EmptyState`: 25 archivos → app/agente.tsx, app/alquiler-publicar.tsx, app/billing-status.tsx, app/ecomerse-favorites.tsx, app/ecomerse-orders.tsx, app/ecomerse-planes.tsx, app/ecomerse.tsx, app/food-menu.tsx, app/food.tsx, app/intercity-publish.tsx, app/lifebook-guardados.tsx, app/lifebook-inbox-comments.tsx, app/lifebook-inbox-likes.tsx, app/lifebook-inbox.tsx, app/lifebook-orders.tsx, app/lifebook-search.tsx, app/lifebook-videos.tsx, app/lifebook-vistos.tsx, app/monedero-movimientos.tsx, app/monedero-recargar.tsx, app/monedero-retirar.tsx, app/monedero.tsx, app/my-tickets.tsx, app/trips-history.tsx, components/jobs.tsx
- `InlineError`: 13 archivos → app/alquiler-publicar.tsx, app/driver-onboarding.tsx, app/driver-profile.tsx, app/ecomerse.tsx, app/food-checkout.tsx, app/lifebook-videos.tsx, app/lifebook-vistos.tsx, app/monedero-pin.tsx, app/monedero-recargar.tsx, app/monedero-retirar.tsx, app/my-tickets.tsx, app/work-publish.tsx, components/DriverHomeSheet.tsx

## 4. Recordatorio

- `Aviso` **no** se difunde a los `Alert` informativos de dinero: es un *toast* que no se puede pulsar.
- Antes de adoptar `EmptyState`, mira si el vacío vive **debajo de un título que ya existe** (un modal, una sección): adoptarlo duplicaría el encabezado.
- `Sheet`: el mejor candidato es el modal que **ya hace a mano** lo que el `Sheet` trae. Y ojo con el tope de altura de la hoja (`maxHeight: 80%`, ya en el kit).
