# CLAUDE.md - Instructions pour Claude Code

Ce fichier documente les problématiques connues et les règles à suivre lors du développement avec mcpick.

## Problème critique : Installation de serveurs MCP hors du registre mcpick

### Description du problème

Lorsqu'un utilisateur demande à Claude Code d'installer un nouveau serveur MCP (ex: "installe le MCP vibium"), Claude Code utilise la commande `claude mcp add` qui installe le serveur **directement dans la configuration Claude** (`~/.claude.json`) et non dans le registre mcpick (`~/.mcpick/registry.json`).

Cela crée une désynchronisation :

1. Le serveur MCP est installé dans `~/.claude.json -> projects["/chemin/parent"].mcpServers`
2. Le serveur n'est **PAS** ajouté au registre mcpick
3. mcpick détecte le serveur (car il lit la config Claude), mais ne peut pas le gérer correctement

### Conséquences

- **Suppression impossible** : mcpick affiche le serveur comme disponible, mais échoue à le supprimer car il cherche dans le mauvais scope
- **Scope incorrect** : Le serveur peut être installé au niveau d'un répertoire parent (ex: home directory) alors que l'utilisateur voulait une installation locale au projet
- **Registre désynchronisé** : Le serveur n'apparaît pas dans le registre mcpick, rendant impossible sa réinstallation après suppression

### Message d'erreur typique

```
Failed to remove [server]: Failed to remove server via CLI: Command failed: claude mcp remove '[server]' -s local
No project-local MCP server found with name: [server]
```

### Règle pour Claude Code

**IMPORTANT** : Lors de l'installation d'un nouveau serveur MCP dans un projet utilisant mcpick :

1. **NE PAS** utiliser directement `claude mcp add`
2. **UTILISER** mcpick pour ajouter le serveur :
   - Soit via la commande interactive : `mcpick` → "Add MCP server"
   - Soit en ajoutant manuellement au registre (`~/.mcpick/registry.json`) puis en activant via mcpick

Cela garantit que :
- Le serveur est ajouté au registre mcpick
- L'utilisateur peut choisir le scope (local, project, user)
- Le serveur peut être géré (activé/désactivé/supprimé) via mcpick

### Structure du registre mcpick

```json
{
  "servers": [
    {
      "name": "nom-du-serveur",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": {},
      "description": "Description du serveur"
    }
  ]
}
```

### Localisation des fichiers

- Registre mcpick : `~/.mcpick/registry.json`
- Config Claude globale : `~/.claude.json`
- Config projet partagée : `./.mcp.json` (versionné dans git)
