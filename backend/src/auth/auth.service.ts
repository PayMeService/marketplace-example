import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './user.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/**
 * The marketplace's own user accounts.
 *
 * Deliberately plain: PayMe has no opinion about how you authenticate your
 * users, and conflating the two is a common source of confusion. A PayMe
 * *seller* (MPL) is created later, for a user who opts in — see SellersService.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Seed the operator account so a fresh clone has somewhere to log in. */
  async onModuleInit(): Promise<void> {
    const email = this.config
      .get<string>('ADMIN_EMAIL', 'admin@marketplace.test')
      .toLowerCase();
    if (await this.users.findOneBy({ email })) return;

    await this.users.save(
      this.users.create({
        email,
        passwordHash: await bcrypt.hash(
          this.config.get<string>('ADMIN_PASSWORD', 'admin1234'),
          10,
        ),
        firstName: 'Marketplace',
        lastName: 'Admin',
        role: UserRole.Admin,
      }),
    );
    this.logger.log(`Seeded admin account: ${email}`);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.findOneBy({ email })) {
      throw new ConflictException('That email is already registered');
    }

    const user = await this.users.save(
      this.users.create({
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: UserRole.User,
      }),
    );

    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email.toLowerCase() },
      // passwordHash is `select: false` on the entity, so it has to be asked
      // for explicitly here — the one place the app is allowed to read it.
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    // Same message either way: distinguishing "no such user" from "wrong
    // password" tells an attacker which emails are registered.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueToken(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** Promote a user once their PayMe seller has been created. */
  async promoteToSeller(userId: string): Promise<void> {
    const user = await this.users.findOneBy({ id: userId });
    if (user && user.role === UserRole.User) {
      user.role = UserRole.Seller;
      await this.users.save(user);
    }
  }

  private async issueToken(user: User) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }
}
