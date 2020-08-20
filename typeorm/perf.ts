import 'reflect-metadata';
import { createConnection, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { performance } from 'perf_hooks';

let total = 0;

export async function bench(times: number, title: string, exec: () => void | Promise<void>) {
  const start = performance.now();
  for (let i = 0; i < times; i++) {
    await exec();
  }
  const took = performance.now() - start;
  total += took;

  // global.gc();
  process.stdout.write([
    (1000 / took) * times, 'ops/s',
    title,
    (took / times).toLocaleString(undefined, { maximumFractionDigits: 17 }), 'ms,',
    process.memoryUsage().rss / 1024 / 1024, 'MB memory',
  ].join(' ') + '\n');
}

@Entity()
export class User {

  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  id2!: number;

  @Column()
  ready?: boolean;

  @Column()
  priority: number = 0;

  @Column()
  name: string;

  constructor(name: string) {
    this.name = name;
  }

}

(async () => {
  const count = 10_000;

  const orm = await createConnection({
    entities: [User],
    database: ':memory:',
    type: 'sqlite',
    synchronize: true,
  });
  const rounds = 5;

  for (let j = 1; j <= rounds; j++) {
    console.log('round', j);
    await bench(1, 'insert', async () => {
      await orm.getRepository(User).delete({});

      for (let i = 1; i <= count; i++) {
        const user = new User('Peter ' + i);
        user.id2 = i;
        user.ready = true;
        user.priority = 5;
        orm.getRepository(User).save(user);
      }
    });

    await bench(1, 'find', async () => {
      const items = await orm.getRepository(User).find({});
    });

    const items = await orm.getRepository(User).find({});
    await bench(1, 'update', async () => {
      for (const i of items) {
        i.priority++;
        await orm.getRepository(User).save(i);
      }
    });

    await bench(1, 'remove', async () => {
      for (const i1 of items) {
        await orm.getRepository(User).remove(i1);
      }
    });
  }

  await orm.close();
  console.log('total (avg per round)', total / rounds);
})();
