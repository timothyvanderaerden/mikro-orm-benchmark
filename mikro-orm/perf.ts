import 'reflect-metadata';
import { Entity, MikroORM, Options, PrimaryKey, Property } from '@mikro-orm/core';
import { performance } from 'perf_hooks';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { ObjectId } from '@mikro-orm/mongodb';

const total: { all: number; find: number; insert: number; update: number; remove: number }[] = [];

export async function bench(round: number, title: string, exec: () => void | Promise<void>) {
  const start = performance.now();
  await exec();
  const took = performance.now() - start;
  total[round].all += took;
  total[round][title] = took;

  // global.gc();
  // process.stdout.write([
  //   (1000 / took), 'ops/s',
  //   title,
  //   took.toLocaleString(undefined, { maximumFractionDigits: 17 }), 'ms,',
  //   process.memoryUsage().rss / 1024 / 1024, 'MB memory',
  // ].join(' ') + '\n');
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

@Entity()
export class MongoUser {

  @PrimaryKey()
  _id!: ObjectId;

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
  const type = process.argv[process.argv.length - 1];
  const count = 10_000;
  const rounds = 10;
  const config: Options<SqliteDriver> = { entities: [User] };

  switch (type) {
    case 'sqlite': Object.assign(config, { dbName: ':memory:', driver: SqliteDriver }); break;
    case 'mysql': Object.assign(config, { dbName: 'mikro_orm_bench', type: 'mysql', port: 3307 }); break;
    case 'pg': Object.assign(config, { dbName: 'mikro_orm_bench', type: 'postgresql' }); break;
    case 'mariadb': Object.assign(config, { dbName: 'mikro_orm_bench', type: 'mariadb', port: 3309 }); break;
    case 'mongo': Object.assign(config, { dbName: 'mikro_orm_bench', type: 'mongo', entities: [MongoUser] }); break;
    default: throw new Error(`Wrong type provided: '${type}'`);
  }

  console.log(`using ${type} driver, ${rounds} rounds (+1 warm up), ${count} items`);
  const orm = await MikroORM.init<SqliteDriver>(config);

  if (config.type === 'mongo') {
    // @ts-ignore
    User = MongoUser;
  } else {
    await orm.getSchemaGenerator().ensureDatabase();
    await orm.getSchemaGenerator().dropSchema();
    await orm.getSchemaGenerator().createSchema();
  }

  for (let j = 0; j <= rounds; j++) {
    process.stdout.write(`\rround ${j}/${rounds}`);
    total[j] = { all: 0, find: 0, insert: 0, update: 0, remove: 0 };
    await bench(j, 'insert', async () => {
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

    await bench(j, 'find', async () => {
      const items = await orm.em.find(User, {});
      orm.em.clear();
    });

    const items = await orm.em.find(User, {});
    items.forEach(i => i.priority++);
    await bench(j, 'update', async () => {
      await orm.em.flush();
    });

    await bench(j, 'remove', async () => {
      await orm.em.flush();
    });
  }

  await orm.close();
  process.stdout.write(`\r`);
  // console.table(total);

  delete total[0]; // ignore first round (warm up)
  const min = { all: Number.MAX_VALUE, find: Number.MAX_VALUE, insert: Number.MAX_VALUE, update: Number.MAX_VALUE, remove: Number.MAX_VALUE };
  const max = { all: 0, find: 0, insert: 0, update: 0, remove: 0 };
  const avg = { all: 0, find: 0, insert: 0, update: 0, remove: 0 };
  total.forEach(row => {
    min.all = Math.min(min.all, row.all);
    min.insert = Math.min(min.insert, row.insert);
    min.find = Math.min(min.find, row.find);
    min.update = Math.min(min.update, row.update);
    min.remove = Math.min(min.remove, row.remove);

    max.all = Math.max(max.all, row.all);
    max.insert = Math.max(max.insert, row.insert);
    max.find = Math.max(max.find, row.find);
    max.update = Math.max(max.update, row.update);
    max.remove = Math.max(max.remove, row.remove);

    avg.all += row.all;
    avg.insert += row.insert;
    avg.find += row.find;
    avg.update += row.update;
    avg.remove += row.remove;
  });

  avg.all /= rounds;
  avg.insert /= rounds;
  avg.find /= rounds;
  avg.update /= rounds;
  avg.remove /= rounds;

  console.table({ min, avg, max });
})();
