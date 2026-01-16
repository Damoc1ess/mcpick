# CLAUDE.md - Instructions pour Claude Code

Ce fichier documente les problématiques connues et les règles **OBLIGATOIRES** à suivre lors du développement avec mcpick.

---

## LOCALISATION CRITIQUE DU REGISTRE

**LE REGISTRE MCPICK EST DANS : `~/.claude/mcpick/servers.json`**

PAS dans `~/.mcpick/registry.json` (ce fichier n'existe pas ou n'est pas utilisé par mcpick).

Le chemin est défini dans `src/utils/paths.ts` :
```typescript
export function get_server_registry_path(): string {
    return join(get_mcpick_dir(), 'servers.json');
    // Résultat : ~/.claude/mcpick/servers.json
}
```

---

## RÈGLE ABSOLUE : Ne JAMAIS utiliser `claude mcp add` directement

### Pourquoi cette règle existe

mcpick est un **gestionnaire de serveurs MCP**. Son principe fondamental :
1. Les serveurs sont définis dans le **registre** (`~/.claude/mcpick/servers.json`)
2. L'utilisateur **active/désactive** les serveurs via mcpick
3. mcpick utilise `claude mcp add` en interne pour installer les serveurs

**Si Claude Code utilise `claude mcp add` directement, cela contourne mcpick et crée une désynchronisation.**

### Ce qui est INTERDIT

```bash
# INTERDIT - Ne JAMAIS faire cela
claude mcp add <server-name> ...
```

### Ce qui est OBLIGATOIRE

1. **Modifier le registre mcpick** (`~/.claude/mcpick/servers.json`)
2. **Demander à l'utilisateur d'activer via mcpick** : `mcpick` → "Enable / Disable MCP servers"

---

## Procédure correcte pour ajouter un nouveau serveur MCP

### Étape 1 : Vérifier le bon package

**IMPORTANT** : Avant d'ajouter un serveur au registre, vérifier le **nom exact du package** en faisant une recherche web ou en testant :

```bash
# Pour npm
npx -y <package> --help

# Pour Python/uvx
uvx <package> --help
```

| Type | Commande | Exemple |
|------|----------|---------|
| npm | `npx` | `npx -y @brightdata/mcp` |
| Python/uvx | `uvx` | `uvx awslabs.aws-api-mcp-server@latest` |

### Étape 2 : Modifier le VRAI registre

**Fichier : `~/.claude/mcpick/servers.json`**

```json
{
  "servers": [
    {
      "name": "nom-du-serveur",
      "type": "stdio",
      "command": "uvx",
      "args": ["package-name@latest"],
      "env": {
        "API_KEY": "valeur"
      },
      "description": "Description du serveur"
    }
  ]
}
```

### Étape 3 : Demander à l'utilisateur d'activer

Dire à l'utilisateur :
```
Le serveur a été ajouté au registre mcpick. Pour l'activer :
1. Lancez `mcpick`
2. Sélectionnez "Enable / Disable MCP servers"
3. Cochez le serveur à activer
4. Choisissez le scope (local/project/user)
```

---

## Packages MCP connus et vérifiés

| Serveur | Commande | Package | Variables d'env |
|---------|----------|---------|-----------------|
| AWS API | `uvx` | `awslabs.aws-api-mcp-server@latest` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |
| Bright Data | `npx` | `@brightdata/mcp` | `API_TOKEN` |
| Google Maps | `npx` | `@modelcontextprotocol/server-google-maps` | `GOOGLE_MAPS_API_KEY` |
| HubSpot | `npx` | `@hubspot/mcp-server` | `PRIVATE_APP_ACCESS_TOKEN` |
| Mailchimp | `npx` | `@agentx-ai/mailchimp-mcp-server` | `MAILCHIMP_API_KEY` |
| Google Workspace | `npx` | `@presto-ai/google-workspace-mcp` | OAuth auto |
| Supabase | `npx` | `@supabase/mcp-server-supabase` | `SUPABASE_ACCESS_TOKEN` |
| Playwright | `npx` | `@playwright/mcp@latest` | - |
| Sequential Thinking | `npx` | `@modelcontextprotocol/server-sequential-thinking` | - |
| Context7 | `npx` | `@upstash/context7-mcp@latest` | - |

---

## Erreurs à ne JAMAIS reproduire

### Erreur 1 : Utiliser `claude mcp add` directement

```bash
# MAUVAIS
claude mcp add aws-api -s user -e AWS_ACCESS_KEY_ID=xxx -- uvx awslabs.aws-api-mcp-server@latest

# BON
# 1. Modifier ~/.claude/mcpick/servers.json
# 2. Demander à l'utilisateur de lancer mcpick pour activer
```

### Erreur 2 : Modifier le mauvais fichier de registre

```bash
# MAUVAIS - ce fichier n'est pas utilisé par mcpick
~/.mcpick/registry.json

# BON - c'est le vrai registre
~/.claude/mcpick/servers.json
```

### Erreur 3 : Utiliser un package qui n'existe pas

```json
// MAUVAIS - ce package n'existe pas
{
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-server-aws"]
}

// BON - package vérifié (AWS MCP est un package Python)
{
  "command": "uvx",
  "args": ["awslabs.aws-api-mcp-server@latest"]
}
```

### Erreur 4 : Ne pas vérifier si le package est npm ou uvx

Toujours vérifier avant d'ajouter :
- **npm** → `npx -y <package>`
- **Python/PyPI** → `uvx <package>`

---

## Localisation des fichiers

| Fichier | Chemin | Description |
|---------|--------|-------------|
| **Registre mcpick** | `~/.claude/mcpick/servers.json` | **LE VRAI FICHIER** - Liste des serveurs disponibles |
| Config Claude globale | `~/.claude.json` | Configuration Claude (ne pas modifier directement) |
| Config projet partagée | `./.mcp.json` | Serveurs partagés (versionné dans git) |
| Backups mcpick | `~/.claude/mcpick/backups/` | Sauvegardes des configurations |
| Profiles mcpick | `~/.claude/mcpick/profiles/` | Profils de configuration |

---

## Checklist avant d'ajouter un MCP

- [ ] J'ai vérifié le nom exact du package (npm ou uvx) via recherche web
- [ ] J'ai testé que le package existe (`npx -y <package> --help` ou `uvx <package> --help`)
- [ ] J'ai modifié le **BON** registre : `~/.claude/mcpick/servers.json`
- [ ] Je n'ai PAS utilisé `claude mcp add` directement
- [ ] J'ai demandé à l'utilisateur d'activer via mcpick

---

## Résumé des erreurs de la session du 15 janvier 2026

1. **Erreur de chemin** : J'ai modifié `~/.mcpick/registry.json` au lieu de `~/.claude/mcpick/servers.json`
2. **Erreur de package** : J'ai utilisé `@anthropic/mcp-server-aws` (n'existe pas) au lieu de `awslabs.aws-api-mcp-server` (via uvx)
3. **Erreur de méthode** : J'ai utilisé `claude mcp add` directement au lieu de passer par mcpick

Ces erreurs ont causé des heures de débogage inutile. NE JAMAIS LES REPRODUIRE.
