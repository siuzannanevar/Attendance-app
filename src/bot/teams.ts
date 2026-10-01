import type { Bot } from "grammy";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";

// Алфавит без похожих символов (нет 0/O, 1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 6) {
  return Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function registerTeams(bot: Bot) {
  bot.command("start", async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(
      "Привет! Я помогу командам собирать ответы на тренировки.\n\n" +
        "В личном чате со мной:\n" +
        "/newteam Название — создать команду\n" +
        "/join КОД — вступить в команду\n" +
        "/myteams — мои команды\n\n" +
        "В группе команды (для организатора):\n" +
        "/linkgroup — привязать группу к команде\n" +
        "/newtraining ДД.ММ ЧЧ:ММ МИН Место — создать тренировку"
    );
  });

  bot.command("newteam", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply("Команду лучше создавать в личном чате со мной.");
    }
    const name = String(ctx.match).trim();
    if (!name) return ctx.reply("Напишите название: /newteam Волейбол колледж");
    const user = await ensureUser(ctx);

    const team = await sql.begin(async (tx) => {
      const [t] = await tx`
        insert into teams (name, created_by) values (${name}, ${user.id})
        returning id, name`;
      await tx`
        insert into memberships (team_id, user_id, role)
        values (${t.id}, ${user.id}, 'admin')`;
      const code = makeCode();
      await tx`
        insert into invite_codes (team_id, code, created_by)
        values (${t.id}, ${code}, ${user.id})`;
      return { name: t.name as string, code };
    });

    await ctx.reply(
      `Команда «${team.name}» создана, вы администратор.\nКод для вступления игроков: ${team.code}`
    );
  });

  bot.command("join", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply("Код лучше отправлять мне в личные сообщения, чтобы его не видела вся группа.");
    }
    const code = String(ctx.match).trim().toUpperCase();
    if (!code) return ctx.reply("Напишите код: /join ABC234");
    const user = await ensureUser(ctx);

    const [invite] = await sql`
      select i.team_id, i.role, t.name
      from invite_codes i join teams t on t.id = i.team_id
      where i.code = ${code} and i.revoked_at is null`;
    if (!invite) return ctx.reply("Код не найден или отозван.");

    await sql`
      insert into memberships (team_id, user_id, role)
      values (${invite.team_id}, ${user.id}, ${invite.role})
      on conflict do nothing`;
    await ctx.reply(`Вы в команде «${invite.name}».`);
  });

  bot.command("myteams", async (ctx) => {
    const user = await ensureUser(ctx);
    const rows = await sql`
      select t.name, m.role
      from memberships m join teams t on t.id = m.team_id
      where m.user_id = ${user.id}
      order by t.name`;
    if (rows.length === 0) return ctx.reply("Вы пока не состоите ни в одной команде.");
    await ctx.reply(
      rows
        .map((r) => `• ${r.name} (${r.role === "admin" ? "организатор" : "участник"})`)
        .join("\n")
    );
  });

  // Привязка Telegram-группы к команде (пишет организатор в группе)
  bot.command("linkgroup", async (ctx) => {
    if (ctx.chat.type === "private") {
      return ctx.reply("Эту команду нужно написать в группе, которую вы хотите привязать.");
    }
    const user = await ensureUser(ctx);
    const name = String(ctx.match).trim();

    const teams = await sql`
      select t.id, t.name
      from teams t join memberships m on m.team_id = t.id
      where m.user_id = ${user.id} and m.role = 'admin'
        and (${name}::text = '' or lower(t.name) = lower(${name}::text))`;

    if (teams.length === 0) {
      return ctx.reply("Не нашла команду, где вы организатор. Проверьте название или создайте команду: /newteam в личном чате со мной.");
    }
    if (teams.length > 1) {
      return ctx.reply(
        "У вас несколько команд. Укажите название: /linkgroup Название\n" +
          teams.map((t) => `• ${t.name}`).join("\n")
      );
    }

    try {
      await sql`update teams set chat_id = ${ctx.chat.id} where id = ${teams[0].id}`;
    } catch (e) {
      console.error(e);
      return ctx.reply("Не получилось привязать: возможно, эта группа уже привязана к другой команде.");
    }
    await ctx.reply(
      `Группа привязана к команде «${teams[0].name}». Теперь организатор может создавать тренировки: /newtraining`
    );
  });
}
