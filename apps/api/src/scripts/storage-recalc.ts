import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { User } from '../auth/user.entity';
import { recalculateStorage } from '../storage/storage-recalc';

// npm run storage:recalc                    backfill uploader + recompute every user's storageUsed
// npm run storage:recalc -- --whois <email> print that user's id (for SUPER_ADMIN_USER_ID) and exit
async function main() {
  const args = process.argv.slice(2);
  const whois = args.indexOf('--whois');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ds = app.get(DataSource);
    if (whois >= 0) {
      const email = args[whois + 1];
      const user = email ? await ds.getRepository(User).findOne({ where: { email } }) : null;
      if (!user) throw new Error(`No user with email "${email ?? ''}"`);
      console.log(user.id);
      return;
    }
    const { backfilled, users } = await recalculateStorage(ds);
    console.log(`Recalculated storage for ${users} users; backfilled uploader on ${backfilled} videos.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
