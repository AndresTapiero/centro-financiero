-- Unifica las categorías viejas de costos bancarios en el grupo "Costos financieros".
-- La app ya las traduce al cargar (CATEGORIAS_RENOMBRADAS en js/constantes.js); esto lo deja
-- permanente en la base. Seguro de correr más de una vez.
update fin_movimientos set categoria = 'Costos financieros · Intereses'  where categoria = 'Intereses';
update fin_movimientos set categoria = 'Costos financieros · Comisiones' where categoria = 'Comisión';
update fin_pendientes  set categoria = 'Costos financieros · Intereses'  where categoria = 'Intereses';
update fin_pendientes  set categoria = 'Costos financieros · Comisiones' where categoria = 'Comisión';
