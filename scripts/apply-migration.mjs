import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const file=process.argv[2];if(!file)throw new Error('Informe o arquivo de migration');
const pool=new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
try{await pool.query(await readFile(file,'utf8'));console.log(`Migration aplicada: ${file}`);}finally{await pool.end();}
