# Discord — community projects (draft, not posted)

**Channel:** OpenCode Discord → community projects (or plugins)

**Attach:** `docs/images/panel-stats.png` and `docs/images/pills-themes.png`

---

**@involvex/oh-my-gui@0.10.0** — Desktop session dashboard for OpenCode

Side panel for Context / Agents / Hooks / Jobs / Stats / Info, composer pills (context, commit, jobs, waiting), session header status chip, titlebar toggle, four Appearance themes (including **Oh My GUI Hacker** / AMOLED), Run-in-terminal on shell fences, and View / Help menu items. Built with the experimental GUI plugin SDK (`Panel`, `ComposerPill`, `Slot`, `TitlebarItem`, `Theme`, `CodeBlockAction`, `SettingsPage`, `MenubarItem`).

**Install** (Desktop `opencode.jsonc`):

```json
{
	"plugins": [{ "package": "@involvex/oh-my-gui@latest" }]
}
```

Toggle with `Ctrl+\`` or `/omg`. Requires Desktop / `@opencode/plugin` ≥ 2.3.2.

- npm: https://www.npmjs.com/package/@involvex/oh-my-gui
- repo: https://github.com/involvex/opencode-oh-my-gui
- GUI docs: https://opencode.ai/docs/build/plugins/gui/

_(Attach the two screenshots above.)_
