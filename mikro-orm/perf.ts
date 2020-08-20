import 'reflect-metadata';
import { Entity, MikroORM, PrimaryKey, Property } from '@mikro-orm/core';
import { performance } from 'perf_hooks';
import { SqliteDriver } from '@mikro-orm/sqlite';

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

  @PrimaryKey()
  id!: number;

  @Property()
  id2!: number;

  @Property()
  ready?: boolean;

  @Property()
  priority: number = 0;

  @Property()
  name: string;

  constructor(name: string) {
    this.name = name;
  }

}

(async () => {
  const count = 10_000;

  const orm = await MikroORM.init<SqliteDriver>({
    entities: [User],
    dbName: ':memory:',
    type: 'sqlite',
  });
  await orm.getSchemaGenerator().createSchema();
  const rounds = 5;

  for (let j = 1; j <= rounds; j++) {
    console.log('round', j);
    await bench(1, 'insert', async () => {
      await orm.em.nativeDelete(User, {});

      for (let i = 1; i <= count; i++) {
        const user = new User('Peter ' + i);
        user.id2 = i;
        user.ready = true;
        user.priority = 5;
        orm.em.persist(user);
      }

      await orm.em.flush();
      orm.em.clear();
    });

    await bench(1, 'find', async () => {
      const items = await orm.em.find(User, {});
      orm.em.clear();
    });

    const items = await orm.em.find(User, {});
    items.forEach(i => i.priority++);
    await bench(1, 'update', async () => {
      await orm.em.flush();
    });

    await bench(1, 'remove', async () => {
      // we need to get around sqlite limitations of max 999 vars in the query
      let i = 0;
      while (i + 999 < items.length) {
        items.slice(i, i + 999).forEach(i => orm.em.remove(i));
        await orm.em.flush();
        i += 999;
      }
    });
  }

  await orm.close();
  console.log('total (avg per round)', total / rounds);
})();
