import { describe,it,expect } from 'vitest'
import { createGame } from '../engine'
import { settleYear, pensionOf, migrateEconomy, projectYear, closeEstate } from '../economy'

describe('экономика T1',()=>{
 it('начисляет вклад и стипендию и не начисляет дважды',()=>{const g=createGame(1);g.age=16;const rng=g.rng;settleYear(g);expect(g.economy.balance).toBe(360+[0,0,200,400,700,1100][g.birth.wealth]!);const before=structuredClone(g);settleYear(g);expect(g).toEqual(before);expect(g.rng).toBe(rng)})
 it('переходит на тариф в 18 лет',()=>{const g=createGame(1);g.age=17;settleYear(g);g.age=18;g.protagonist.job='Техник';settleYear(g);expect(g.economy.work.kind).toBe('working');expect(g.economy.years.at(-1)?.wage).toBe(1100)})
 it('фонд покрывает только минимум и жильё понижается',()=>{const g=createGame(1);g.age=30;g.economy.work.kind='sick';g.economy.work.until=30;g.economy.housing=2;g.economy.services['dome-pass']=20;g.economy.work.grade=1;g.economy.work.load=0;g.protagonist.job='Ученик';g.economy.balance=0;g.economy.work.kind='between';g.economy.work.lastWage=0;settleYear(g);expect(g.economy.years.at(-1)?.aid).toBe(350);expect(g.economy.balance).toBe(0);expect(g.economy.housing).toBe(0);expect(g.economy.housingRight).toEqual({tier:2,until:33});expect(g.economy.services).toEqual({})})
 it('работа в 65 и пенсия в 77',()=>{const g=createGame(1);g.age=65;g.economy.work.kind='working';expect(settleYear(g).stats.health).toBe(-1);g.age=77;settleYear(g);expect(g.economy.work.kind).toBe('retired');expect(g.economy.years.at(-1)?.pension).toBeGreaterThanOrEqual(360)})
 it('наставник получает надбавку до 80',()=>{const g=createGame(1);g.age=80;g.economy.work.kind='retired';g.economy.work.path='mentor';g.economy.work.lastWage=1000;settleYear(g);expect(g.economy.years.at(-1)?.wage).toBe(250);g.age=81;settleYear(g);expect(g.economy.years.at(-1)?.wage).toBe(0)})
 it('прогноз не меняет состояние и смерть закрывает счёт',()=>{const g=createGame(2);g.age=20;const before=structuredClone(g);projectYear(g);expect(g).toEqual(before);closeEstate(g);const balance=g.economy.balance;g.age++;settleYear(g);expect(g.economy.balance).toBe(balance)})
 it('миграция фиксирует текущий возраст',()=>{const g=createGame(2);g.age=40;g.economy=migrateEconomy(g);const before=structuredClone(g.economy);settleYear(g);expect(g.economy).toEqual(before);expect(pensionOf(g.economy.work)).toBeGreaterThanOrEqual(360)})
})
