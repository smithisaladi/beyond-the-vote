/**
 * `/bills` — legislation index.
 *
 * Thin server-component shim. Re-exports the client component that owns
 * the UI so metadata/static-render configuration can live next to the
 * route entry while the interactive logic stays in `components/bills/`.
 */

export { default } from '@/components/bills/BillsPage'
