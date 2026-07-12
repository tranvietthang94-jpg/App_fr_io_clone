import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);

  try {
    // Create admin user
    const result = await authService.register(
      'admin@frameclone.local',
      'admin123',
      'Admin User',
    );
    console.log('✅ Admin user created:');
    console.log('   Email: admin@frameclone.local');
    console.log('   Password: admin123');
    console.log('   Name: Admin User');
  } catch (error: any) {
    if (error.message?.includes('Email đã được sử dụng')) {
      console.log('⚠️  Admin user already exists');
    } else {
      console.error('❌ Error creating admin user:', error.message);
    }
  }

  await app.close();
}

seed();