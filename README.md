# Veebee
[![Build and Release](https://github.com/veebeedb/veebee/actions/workflows/build.yml/badge.svg)](https://github.com/veebeedb/veebee/actions/workflows/build.yml)
[![Translation status](http://weblate.valerie.lol/widget/veebee/svg-badge.svg)](http://weblate.valerie.lol/engage/veebee/)

Veebee is under 2 licenses, our "Veebee License" takes priority over GPLv3, both licenses still apply.

A custom made bot, initialized and being created with [Bun](https://bun.com/), [Typescript](https://www.typescriptlang.org/), [Discord.js](https://discordjs.guide/).

## DISCLAIMER

Veebee - Discord Bot is not ready for full production use, we are not responsible for any damage users may cause with Veebee, you have been warned.

## Veebee Links

[Trello Roadmap](https://trello.com/b/UiHToYsG/veebee-roadmap)

## Planned Features

Priority:
- [x] Moderation System (Mostly functioning, not complete)

- [ ] Plugins (Petals), enabled and disabled on servers via commands. (Inspired by Red-DiscordBot's Cog System)
- [ ] Server Syncing (Ban Sync, etc)
- [ ] Economy System (Banking, Shop, etc)
- [ ] Audio Features (Music, MP3, etc) (In progress)
- [ ] User Opt-ins/Opt-outs (Allowing the user to opt-in/out of bot storing your data [excluding moderation])
- [ ] Improved Database

## TBD Ideas

- [ ] Sakura & Bee Branding
- [ ] Allow Custom Commands
- [ ] Ban Appeal System
- [ ] Web Dashboard

## To Do

Priority:
- [ ] Secure Database Encryption

Non-Priority:
- [ ] Clean Up Dependencies
- [ ] Convert Database System to MongoDB, or MariaDB. (Likely MongoDB)
- [ ] Improve Premium System, tie directly to account instead of roles, etc.

## Setup Guide

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.19. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
