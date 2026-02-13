import { access, readFile, writeFile } from 'node:fs/promises';
import { ClaudeConfig, McpScope, McpServer, McpServerBase, ServerWithSource } from '../types.js';
import {
	get_claude_config_path,
	get_current_project_path,
	get_global_mcp_json_path,
	get_project_mcp_json_path,
} from '../utils/paths.js';
import { validate_claude_config } from './validation.js';

export async function read_claude_config(): Promise<ClaudeConfig> {
	const config_path = get_claude_config_path();

	try {
		await access(config_path);
		const config_content = await readFile(config_path, 'utf-8');
		const parsed_config = JSON.parse(config_content);
		return validate_claude_config(parsed_config);
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return { mcpServers: {} };
		}
		throw error;
	}
}

export async function write_claude_config(
	config: ClaudeConfig,
): Promise<void> {
	const config_path = get_claude_config_path();

	// Read the entire existing file to preserve all other sections
	let existing_config: any = {};
	try {
		const existing_content = await readFile(config_path, 'utf-8');
		existing_config = JSON.parse(existing_content);
	} catch (error) {
		// If file doesn't exist or is invalid, start with empty object
	}

	// Only update the mcpServers section, preserve everything else
	existing_config.mcpServers = config.mcpServers;

	const config_content = JSON.stringify(existing_config, null, 2);
	await writeFile(config_path, config_content, 'utf-8');
}

export function get_enabled_servers(
	config: ClaudeConfig,
): McpServer[] {
	if (!config.mcpServers) {
		return [];
	}

	return Object.entries(config.mcpServers).map(([name, server]) => ({
		...server,
		name,
	}));
}

export function create_config_from_servers(
	selected_servers: McpServer[],
): ClaudeConfig {
	const mcp_servers: { [key: string]: McpServerBase } = {};

	selected_servers.forEach((server) => {
		const { name, ...server_config } = server;
		mcp_servers[name] = server_config;
	});

	return { mcpServers: mcp_servers };
}

/**
 * Read full Claude config including projects section
 */
async function read_claude_config_full(): Promise<any> {
	const config_path = get_claude_config_path();

	try {
		await access(config_path);
		const config_content = await readFile(config_path, 'utf-8');
		return JSON.parse(config_content);
	} catch (error) {
		return { mcpServers: {}, projects: {} };
	}
}

/**
 * Read MCP servers for local scope (current project only)
 * Stored in ~/.claude.json -> projects[cwd].mcpServers
 * Also searches parent directories since Claude CLI may store config at parent level
 * Returns servers with their source path for proper removal
 */
async function read_local_mcp_servers_with_source(): Promise<ServerWithSource[]> {
	const { dirname } = await import('node:path');
	const { homedir } = await import('node:os');
	const full_config = await read_claude_config_full();
	const home = homedir();
	let current_dir = get_current_project_path();
	const servers: ServerWithSource[] = [];
	const seen_names = new Set<string>();

	// Search current directory and parents for local config
	// Collect all servers, tracking which directory they come from
	while (current_dir && current_dir !== '/' && current_dir.length >= home.length) {
		const project_config = full_config.projects?.[current_dir];
		if (project_config?.mcpServers) {
			for (const name of Object.keys(project_config.mcpServers)) {
				// Only add if not already seen (closer dirs take precedence)
				if (!seen_names.has(name)) {
					seen_names.add(name);
					servers.push({ name, sourcePath: current_dir });
				}
			}
		}
		current_dir = dirname(current_dir);
	}

	return servers;
}

/**
 * Read MCP servers for local scope - returns just names for backward compatibility
 */
async function read_local_mcp_servers(): Promise<string[]> {
	const servers = await read_local_mcp_servers_with_source();
	return servers.map(s => s.name);
}

/**
 * Read MCP servers from .mcp.json in current project (project scope)
 */
async function read_project_mcp_servers(): Promise<string[]> {
	const mcp_json_path = get_project_mcp_json_path();

	try {
		await access(mcp_json_path);
		const content = await readFile(mcp_json_path, 'utf-8');
		const parsed = JSON.parse(content);
		const servers = parsed.mcpServers || {};
		return Object.keys(servers);
	} catch (error) {
		return [];
	}
}

/**
 * Read MCP servers from ~/.claude.json -> mcpServers (top-level, user scope)
 */
async function read_user_mcp_servers(): Promise<string[]> {
	const config_path = get_claude_config_path();
	try {
		await access(config_path);
		const content = await readFile(config_path, 'utf-8');
		const parsed = JSON.parse(content);
		const servers = parsed.mcpServers || {};
		return Object.keys(servers);
	} catch (error) {
		return [];
	}
}

/**
 * Read MCP servers from .mcp.json files (project scope)
 * Searches current directory and parents for .mcp.json
 */
async function find_and_read_project_mcp_json(): Promise<string[]> {
	const { dirname } = await import('node:path');
	let current_dir = get_current_project_path();
	const home = (await import('node:os')).homedir();

	// Search upward for .mcp.json, stop at home or root
	while (current_dir && current_dir !== '/' && current_dir.length >= home.length) {
		const mcp_path = `${current_dir}/.mcp.json`;
		try {
			await access(mcp_path);
			const content = await readFile(mcp_path, 'utf-8');
			const parsed = JSON.parse(content);
			const servers = parsed.mcpServers || {};
			return Object.keys(servers);
		} catch {
			// Not found, try parent
		}
		current_dir = dirname(current_dir);
	}
	return [];
}

/**
 * Get currently enabled server names for a specific scope
 */
export async function get_enabled_servers_for_scope(
	scope: McpScope,
): Promise<string[]> {
	switch (scope) {
		case 'local':
			return read_local_mcp_servers();
		case 'project':
			return find_and_read_project_mcp_json();
		case 'user':
			return read_user_mcp_servers();
	}
}

/**
 * Get currently enabled servers with source path for local scope
 * This is needed for proper removal of servers installed in parent directories
 */
export async function get_local_servers_with_source(): Promise<ServerWithSource[]> {
	return read_local_mcp_servers_with_source();
}

/**
 * Get full server configurations for a specific scope
 * Returns McpServer[] with full config (command, args, env, etc.)
 */
export async function get_enabled_servers_full_for_scope(
	scope: McpScope,
): Promise<McpServer[]> {
	const full_config = await read_claude_config_full();

	switch (scope) {
		case 'local': {
			const { dirname } = await import('node:path');
			const { homedir } = await import('node:os');
			const home = homedir();
			let current_dir = get_current_project_path();
			const servers: McpServer[] = [];
			const seen_names = new Set<string>();

			while (current_dir && current_dir !== '/' && current_dir.length >= home.length) {
				const project_config = full_config.projects?.[current_dir];
				if (project_config?.mcpServers) {
					for (const [name, config] of Object.entries(project_config.mcpServers)) {
						if (!seen_names.has(name) && typeof config === 'object' && config !== null) {
							seen_names.add(name);
							servers.push({ name, ...(config as object) } as McpServer);
						}
					}
				}
				current_dir = dirname(current_dir);
			}
			return servers;
		}
		case 'project': {
			const { dirname } = await import('node:path');
			const { homedir } = await import('node:os');
			const home = homedir();
			let current_dir = get_current_project_path();

			while (current_dir && current_dir !== '/' && current_dir.length >= home.length) {
				const mcp_path = `${current_dir}/.mcp.json`;
				try {
					await access(mcp_path);
					const content = await readFile(mcp_path, 'utf-8');
					const parsed = JSON.parse(content);
					const mcp_servers = parsed.mcpServers || {};
					return Object.entries(mcp_servers)
						.filter(([, config]) => typeof config === 'object' && config !== null)
						.map(([name, config]) => ({
							name,
							...(config as object),
						})) as McpServer[];
				} catch {
					// Not found, try parent
				}
				current_dir = dirname(current_dir);
			}
			return [];
		}
		case 'user': {
			const mcp_servers = full_config.mcpServers || {};
			return Object.entries(mcp_servers)
				.filter(([, config]) => typeof config === 'object' && config !== null)
				.map(([name, config]) => ({
					name,
					...(config as object),
				})) as McpServer[];
		}
	}
}
