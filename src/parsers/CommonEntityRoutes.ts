/**
 * Common Drupal entity routes that are generated dynamically
 * These don't appear in .routing.yml files but are valid routes
 */
export const COMMON_ENTITY_ROUTES = [
  // Node entity routes
  'entity.node.canonical',
  'entity.node.edit_form',
  'entity.node.delete_form',
  'entity.node.version_history',
  'entity.node.revision',
  'entity.node.application_create',
  'entity.node.add_form',
  'entity.node.add_page',

  // User entity routes
  'entity.user.canonical',
  'entity.user.edit_form',
  'entity.user.cancel_form',
  'entity.user.collection',

  // Taxonomy term routes
  'entity.taxonomy_term.canonical',
  'entity.taxonomy_term.edit_form',
  'entity.taxonomy_term.delete_form',
  'entity.taxonomy_term.add_form',
  'entity.taxonomy_vocabulary.collection',
  'entity.taxonomy_vocabulary.overview_form',

  // Comment routes
  'entity.comment.canonical',
  'entity.comment.edit_form',
  'entity.comment.delete_form',

  // Media routes
  'entity.media.canonical',
  'entity.media.edit_form',
  'entity.media.delete_form',
  'entity.media.add_form',
  'entity.media.collection',

  // File routes
  'entity.file.canonical',

  // Block content routes
  'entity.block_content.canonical',
  'entity.block_content.edit_form',
  'entity.block_content.delete_form',

  // Menu link routes
  'entity.menu.edit_form',
  'entity.menu.delete_form',
  'entity.menu.collection',

  // View routes
  'entity.view.edit_form',
  'entity.view.collection',

  // Common admin routes
  'system.admin',
  'system.admin_content',
  'system.admin_structure',
  'system.admin_config',
  'system.themes_page',
  'system.modules_list',
  'system.status',
  'system.admin_reports',

  // User routes
  'user.login',
  'user.logout',
  'user.register',
  'user.pass',
  'user.page',
  'user.admin_permissions',
  'user.role_list',
  'user.admin_index',

  // Content routes
  'node.add_page',
  'node.add',
  'system.db_update',

  // Path alias routes
  'path.admin_overview',
  'path.admin_add',

  // Config routes
  'system.site_information_settings',
  'system.performance_settings',
  'system.logging_settings',
  'system.cron_settings',

  // Common View routes (examples - these are dynamic but commonly used)
  'view.frontpage.page_1',
  'view.content.page_1',
  'view.files.page_1',
  'view.user_admin_people.page_1'
];

/**
 * Get all common entity routes
 */
export function getCommonEntityRoutes(): string[] {
  return COMMON_ENTITY_ROUTES;
}
