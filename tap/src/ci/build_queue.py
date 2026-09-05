"""Durable, system-neutral review ownership. The caller also holds a process lifetime lock."""
import json, sqlite3, time

class BuildQueue:
    def __init__(self, path):
        self.db=sqlite3.connect(path,timeout=20,isolation_level=None)
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS tasks (
          identity TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL,
          generation INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
          lease_until REAL NOT NULL DEFAULT 0, next_at REAL NOT NULL DEFAULT 0,
          detail TEXT NOT NULL DEFAULT '{}')''')

    def enqueue(self, identity, payload):
        self.db.execute("INSERT OR IGNORE INTO tasks(identity,payload,state) VALUES(?,?,'pending')",(identity,json.dumps(payload)))
        stored=json.loads(self.db.execute('SELECT payload FROM tasks WHERE identity=?',(identity,)).fetchone()[0])
        if stored!=payload: raise ValueError('immutable-build-identity-changed')

    def recover(self):
        # Only after acquiring the sole process lock and killing orphan descendants via the OS job.
        self.db.execute("UPDATE tasks SET state='retry',lease_until=0 WHERE state='running'")

    def claim(self, now=None):
        now=time.time() if now is None else now
        self.db.execute('BEGIN IMMEDIATE')
        try:
            if self.db.execute("SELECT 1 FROM tasks WHERE state='running' LIMIT 1").fetchone():
                self.db.execute('COMMIT');return None
            row=self.db.execute("SELECT * FROM tasks WHERE state IN ('pending','retry') AND next_at<=? ORDER BY rowid LIMIT 1",(now,)).fetchone()
            if row is None:self.db.execute('COMMIT');return None
            self.db.execute("UPDATE tasks SET state='running',generation=generation+1,attempts=attempts+1,lease_until=? WHERE identity=?",(now+90,row['identity']))
            result=dict(self.db.execute('SELECT * FROM tasks WHERE identity=?',(row['identity'],)).fetchone())
            self.db.execute('COMMIT');return result
        except BaseException:self.db.execute('ROLLBACK');raise

    def assert_owner(self, task):
        row=self.db.execute('SELECT state,generation,lease_until FROM tasks WHERE identity=?',(task['identity'],)).fetchone()
        if not row or row['state']!='running' or row['generation']!=task['generation'] or row['lease_until']<time.time():raise RuntimeError('stale-worker-owner')

    def renew(self, task):
        self.assert_owner(task)
        self.db.execute('UPDATE tasks SET lease_until=? WHERE identity=?',(time.time()+90,task['identity']))

    def finish(self, task, state, detail, delay=0):
        if state not in ['reviewed','retry','needs-action','awaiting-verification']:raise ValueError('invalid-task-terminal-state')
        self.assert_owner(task)
        self.db.execute('UPDATE tasks SET state=?,detail=?,lease_until=0,next_at=? WHERE identity=?',
                        (state,json.dumps(detail,ensure_ascii=False),time.time()+delay,task['identity']))

    def rows(self):return [dict(r) for r in self.db.execute('SELECT * FROM tasks ORDER BY rowid')]
