# Roles y accesos — BION

## Estructura

**Empresa → Divisiones → Sistemas de IA**

- Toda empresa tiene al menos 1 división.
- Al crear una empresa se crea automáticamente su primera división.
- Empresas con varias operaciones (ej. Codelco) tienen varias divisiones.

## Roles

| Rol | Código | Alcance |
|---|---|---|
| BION Admin | `bion_admin` | Todas las empresas |
| Super usuario empresa | `super_empresa` | Su empresa (todas sus divisiones) |
| Super usuario división | `super_division` | 1 división asignada |
| Usuario división | `usuario_division` | 1 división asignada |

- BION Admin vive en la tabla `admin_users` y entra por `/admin`.
- Los demás roles viven en la tabla `users`.
- `super_division` y `usuario_division` tienen exactamente una división (`division_id`).
- `super_empresa` no tiene `division_id`: accede a todas.

## Permisos

| Acción | BION Admin | Super empresa | Super división | Usuario división |
|---|---|---|---|---|
| Ver sistemas | Todas las empresas | Su empresa | Su división | Su división |
| Crear / editar sistemas | ✓ | Su empresa | Su división | ✗ |
| Borrar sistemas (lógico) | ✓ | Su empresa | Su división | ✗ |
| Generar reportes | ✓ | Su empresa | Su división | Su división |
| Crear divisiones | ✓ | Su empresa | ✗ | ✗ |
| Crear usuarios | Todos los roles | `super_division`, `usuario_division` de su empresa | ✗ | ✗ |
| Crear empresas | ✓ | ✗ | ✗ | ✗ |

Regla: un usuario solo puede crear usuarios con **menor** acceso que el suyo.

## Reglas de seguridad

1. Los permisos se validan **en el servidor** (APIs), no solo en la pantalla.
2. Tokens de BION Admin y de clientes son distintos (`type: admin` / `type: client`) y no son intercambiables.
3. Toda lectura/escritura se filtra por empresa y, si corresponde, por división.
4. Los reportes solo se generan dentro del alcance del usuario.
5. Borrado siempre lógico (`status = 'inactive'`).

## Migración de roles actuales

| Rol actual | Rol nuevo |
|---|---|
| `company_admin` | `super_empresa` |
| `branch_manager` | `super_division` |
| `company_user` | `usuario_division` |

## Pendiente (fase posterior)

- Registro de cambios (auditoría).
- Verificación en dos pasos para BION Admin y super usuarios.
