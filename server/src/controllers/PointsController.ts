import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import knex from '../database/connection';
import generateToken from '../utils/token';

class PointsController {
    async index(request: Request, response: Response) {
        // cidades, uf, items (Query params)
        const { city, uf, items, ignoreItems, returnItems, } = request.query;
        
        let query = knex('points')
            .join('point_items', 'points.id', '=', 'point_items.point_id');

        if (!ignoreItems) {
            const parsedItems = String(items)
                .split(',')
                .map(item => Number(item.trim()));

            query = query
                .whereIn('point_items.item_id', parsedItems);
        }

        query = query
            .where('city', String(city))
            .where('uf', String(uf))
            .distinct()
            .select('points.*');
        
        const points = await query;

        let serializedPoints = points.map((point) => {
            return {
                ...point,
                image_url: `http://10.0.0.103:3333/uploads/images/${point.image}`,
            };
        });

        if (returnItems) {
            const promisingData = Promise.all(serializedPoints.map(async (point) => {
                const fetchedItems = await knex('items')
                    .join('point_items', 'items.id', '=', 'point_items.item_id')
                    .where('point_items.point_id', point.id)
                    .select('items.title');
                const newPoint = {
                    point,
                    items: fetchedItems,
                };
                return newPoint;
            }));
            
            serializedPoints = await promisingData;
        }
        
        return response.json(serializedPoints);
    }

    async show(request: Request, response: Response) {
        const { id } = request.params;

        const point = await knex('points').where('id', id).first();

        if (!point) {
            return response.status(400).json({
                message: 'point not found.',
            });
        }

        const serializedPoint = {
            ...point,
            image_url: `http://10.0.0.103:3333/uploads/images/${point.image}`,
        };

        const items = await knex('items')
            .join('point_items', 'items.id', '=', 'point_items.item_id')
            .where('point_items.point_id', id)
            .select('items.title');
        
        return response.json({ point: serializedPoint, items });
    }

    async create(request: Request, response: Response) {
        const {
            name,
            email,
            password,
            whatsapp,
            latitude,
            longitude,
            city,
            uf,
            items,
        } = request.body;
        // make the e-mail as unique
        const hasSameEmail = await knex('points').where('email', email);
        if (hasSameEmail.length > 0) {
            return response.status(400)
                .json({
                    error: true,
                    information: {
                        in: 'create_point',
                        code: 'EMAIL_ALREADY_REGISTERED',
                        message: 'Only one point per e-mail permited.',
                    },
                });
        }
        // create the password hash 
        const passwordHash = await bcrypt.hash(password, 10);
        // initialize the knex transaction
        const trx = await knex.transaction();

        const point = {
            image: request.file.filename,
            name,
            email,
            password: passwordHash,
            whatsapp,
            latitude,
            longitude,
            city,
            uf,
        };

        const insertedIds = await trx('points').insert(point);
        const pointId = insertedIds[0];
    
        const pointItems = items
            .split(',')
            .map((item: string) => Number(item.trim()))
            .map((itemId: number) => {
                return {
                    item_id: itemId,
                    point_id: pointId,
                }
            });
    
        await trx('point_items').insert(pointItems);

        await trx.commit();

        const token = generateToken({ id: pointId });
    
        return response.json({
            point: {
                id: pointId,
                ... point,
                password: undefined,
            },
            token,
        });
    }

    async update(request: Request, response: Response) {
        const {
            originalemail,
            name,
            email,
            password,
            whatsapp,
            latitude,
            longitude,
            city,
            uf,
            items,
        } = request.body;
        
        // make the new e-mail as unique
        if (email && email != '' && email !== originalemail) {
            const hasSameEmail = await knex('points').where('email', email);
            if (hasSameEmail.length > 0) {
                return response.status(400)
                    .json({
                        error: true,
                        information: {
                            in: 'create_point',
                            code: 'EMAIL_ALREADY_REGISTERED',
                            message: 'Only one point per e-mail permited.',
                        },
                    });
            }
        }
        let passwordHash = undefined;
        // create the password hash 
        if (password && password !== '') {
            passwordHash = await bcrypt.hash(password, 10);
        }
        // initialize the knex transaction
        const trx = await knex.transaction();

        const rawPoint = await trx('points')
            .where('email', originalemail)
            .first();
        if (!rawPoint) {
            trx.rollback();
            return response.status(400).json({
                message: 'raw point not found.',
            });
        }
        const pointId = rawPoint.id;

        let image : undefined | string = undefined;
        if (request.file) {
            // an new file is uploaded
            fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'images', rawPoint.image));
            image = request.file.filename;
        }

        const point = {
            name,
            email,
            password: passwordHash,
            whatsapp,
            latitude,
            longitude,
            city,
            uf,
            image,
        };

        const result = await trx('points')
            .where('id', pointId)
            .update(point);

        if (items && items !== '') {
            await trx('point_items')
                .where('point_id', pointId)
                .delete();

            const pointItems = items
                .split(',')
                .map((item: string) => Number(item.trim()))
                .map((itemId: number) => {
                    return {
                        item_id: itemId,
                        point_id: pointId,
                    }
                });
            await trx('point_items').insert(pointItems);
        }

        const outputPoint = await trx('points')
            .where('id', pointId)
            .first();

        const serializedOutputPoint = {
            ...outputPoint,
            password: undefined,
            image_url: `http://10.0.0.103:3333/uploads/images/${outputPoint.image}`,
        };

        const outputItems = await trx('items')
            .join('point_items', 'items.id', '=', 'point_items.item_id')
            .where('point_items.point_id', pointId)
            .select('items.title', 'items.id');

        await trx.commit();

        return response.json({
            point: serializedOutputPoint,
            items: outputItems,
        });
    }
}

export default PointsController;
