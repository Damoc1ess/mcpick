import { log, multiselect, note, select } from '@clack/prompts';
import {
	create_config_from_servers,
	get_enabled_servers,
	get_enabled_servers_for_scope,
	get_enabled_servers_full_for_scope,
	get_local_servers_with_source,
	read_claude_config,
	write_claude_config,
} from '../core/config.js';
import {
	get_all_available_servers,
	sync_servers_to_registry,
} from '../core/registry.js';
import { McpScope, McpServer, ServerWithSource } from '../types.js';

/**
 * Compare two server configurations to check if they are different
 * Returns true if the configurations differ
 */
function server_configs_differ(registry_server: McpServer, claude_server: McpServer): boolean {
	// Compare command
	if ('command' in registry_server && 'command' in claude_server) {
		if (registry_server.command !== claude_server.command) {
			return true;
		}
	}

	// Compare args
	if ('args' in registry_server && 'args' in claude_server) {
		const registry_args = registry_server.args || [];
		const claude_args = claude_server.args || [];
		if (JSON.stringify(registry_args) !== JSON.stringify(claude_args)) {
			return true;
		}
	}

	// Compare URL for http/sse transports
	if ('url' in registry_server && 'url' in claude_server) {
		if (registry_server.url !== claude_server.url) {
			return true;
		}
	}

	// Compare type/transport
	if (registry_server.type !== claude_server.type) {
		return true;
	}

	return false;
}
import {
	add_mcp_via_cli,
	check_claude_cli,
	get_scope_options,
	get_scope_description,
	remove_mcp_via_cli,
} from '../utils/claude-cli.js';

export async function edit_config(): Promise<void> {
	try {
		// Check if Claude CLI is available
		const cli_available = await check_claude_cli();

		// Ask which scope to edit
		const scope = await select<McpScope>({
			message: 'Which configuration do you want to edit?',
			options: get_scope_options(),
			initialValue: 'local',
		});

		if (typeof scope === 'symbol') return;

		const current_config = await read_claude_config();

		// If registry is empty but .claude.json has servers, populate registry from config
		let all_servers = await get_all_available_servers();
		if (all_servers.length === 0 && current_config.mcpServers) {
			const current_servers = get_enabled_servers(current_config);
			if (current_servers.length > 0) {
				await sync_servers_to_registry(current_servers);
				all_servers = current_servers;
				note(
					`Imported ${current_servers.length} servers from your .claude.json file into registry.`,
				);
			}
		}

		if (all_servers.length === 0) {
			note(
				'No MCP servers found in .claude.json or registry. Add servers first.',
			);
			return;
		}

		// Get currently enabled servers for the selected scope
		const currently_enabled = await get_enabled_servers_for_scope(scope);

		// For local scope, get servers with their source paths for proper removal
		let local_servers_with_source: ServerWithSource[] = [];
		if (scope === 'local') {
			local_servers_with_source = await get_local_servers_with_source();
		}

		const server_choices = all_servers.map((server) => ({
			value: server.name,
			label: server.name,
			hint: server.description || '',
		}));

		const selected_server_names = await multiselect({
			message: `Select MCP servers for ${get_scope_description(scope)}:`,
			options: server_choices,
			initialValues: currently_enabled,
			required: false,
		});

		if (typeof selected_server_names === 'symbol') {
			return;
		}

		const selected_servers = all_servers.filter((server) =>
			selected_server_names.includes(server.name),
		);

		// DEBUG: Log all_servers to see what config is being used
		console.log('[DEBUG edit-config] all_servers for aws-api:');
		const aws_server = all_servers.find(s => s.name === 'aws-api');
		if (aws_server) {
			console.log(`  command: ${('command' in aws_server) ? aws_server.command : 'N/A'}`);
			console.log(`  args: ${('args' in aws_server) ? JSON.stringify(aws_server.args) : 'N/A'}`);
		}

		// Get full configurations of currently enabled servers to detect config changes
		const currently_enabled_full = await get_enabled_servers_full_for_scope(scope);

		// Determine which servers to add, remove, and UPDATE
		const servers_to_add = selected_server_names.filter(
			(name) => !currently_enabled.includes(name),
		);
		const servers_to_remove = currently_enabled.filter(
			(name) => !selected_server_names.includes(name),
		);

		// Find servers that are enabled but have different config than registry
		// These need to be removed and re-added to update their configuration
		const servers_to_update: string[] = [];
		for (const name of selected_server_names) {
			// Skip if it's a new server (will be added anyway)
			if (servers_to_add.includes(name)) continue;

			const registry_server = all_servers.find((s) => s.name === name);
			const claude_server = currently_enabled_full.find((s) => s.name === name);

			if (registry_server && claude_server) {
				if (server_configs_differ(registry_server, claude_server)) {
					servers_to_update.push(name);
					log.info(`Server "${name}" has different config in registry, will update`);
				}
			}
		}

		// If CLI is available, use it for add/remove operations
		if (cli_available && (scope === 'local' || scope === 'project')) {
			let success_count = 0;
			let error_count = 0;

			// First, remove servers that need to be updated (will be re-added with new config)
			for (const name of servers_to_update) {
				let cwd: string | undefined;
				if (scope === 'local') {
					const server_info = local_servers_with_source.find(s => s.name === name);
					if (server_info) {
						cwd = server_info.sourcePath;
					}
				}

				const result = await remove_mcp_via_cli(name, scope, cwd);
				if (!result.success) {
					error_count++;
					log.warn(`Failed to remove ${name} for update: ${result.error}`);
				}
			}

			// Add new servers AND servers that were removed for update
			const servers_to_add_all = [...servers_to_add, ...servers_to_update];
			for (const name of servers_to_add_all) {
				const server = all_servers.find((s) => s.name === name);
				if (server) {
					const result = await add_mcp_via_cli(server, scope);
					if (result.success) {
						success_count++;
					} else {
						error_count++;
						log.warn(`Failed to add ${name}: ${result.error}`);
					}
				}
			}

			// Remove servers that user deselected
			for (const name of servers_to_remove) {
				// For local scope, find the source path where the server is actually installed
				let cwd: string | undefined;
				if (scope === 'local') {
					const server_info = local_servers_with_source.find(s => s.name === name);
					if (server_info) {
						cwd = server_info.sourcePath;
					}
				}

				const result = await remove_mcp_via_cli(name, scope, cwd);
				if (result.success) {
					success_count++;
				} else {
					error_count++;
					log.warn(`Failed to remove ${name}: ${result.error}`);
				}
			}

			await sync_servers_to_registry(selected_servers);

			if (error_count > 0) {
				note(
					`Configuration updated with ${error_count} errors.\n` +
						`Scope: ${get_scope_description(scope)}\n` +
						`Added: ${servers_to_add.length}, Removed: ${servers_to_remove.length}, Updated: ${servers_to_update.length}`,
				);
			} else {
				note(
					`Configuration updated!\n` +
						`Scope: ${get_scope_description(scope)}\n` +
						`Enabled servers: ${selected_servers.length}` +
						(servers_to_update.length > 0 ? `\nUpdated: ${servers_to_update.length} server(s)` : ''),
				);
			}
		} else {
			// Fallback to direct file writing (user scope or no CLI)
			const new_config = create_config_from_servers(selected_servers);
			await write_claude_config(new_config);
			await sync_servers_to_registry(selected_servers);

			if (!cli_available && scope !== 'user') {
				log.warn(
					`Claude CLI not available. Changes written to ~/.claude.json (user scope) instead of ${scope} scope.`,
				);
			}

			note(
				`Configuration updated!\n` +
					`Enabled servers: ${selected_servers.length}`,
			);
		}
	} catch (error) {
		throw new Error(
			`Failed to edit configuration: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
