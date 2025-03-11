import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import ValidationError from "../domain/errors/validation-error";
import Order from "../infrastructure/schemas/Order";
import Product from "../infrastructure/schemas/Product"; 
import { getAuth } from "@clerk/express";
import NotFoundError from "../domain/errors/not-found-error";
import Address from "../infrastructure/schemas/Address";
import { CreateOrderDTO } from "../domain/dto/order";
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = CreateOrderDTO.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError("Invalid order data");
    }

    const userId = req.auth.userId;

    // Validate stock for all items
    for (const item of result.data.items) {
      const productItem = await Product.findById(item.product._id);
      if (!productItem || productItem.stock < item.quantity) {
        throw new ValidationError(`Insufficient stock for product ${item.product._id}`);
      }
    }

    const address = await Address.create({
      ...result.data.shippingAddress,
    });

    // Create the order
    const order = await Order.create({
      userId,
      items: result.data.items,
      addressId: address._id,
    });

    // Update inventory for each product
    await Promise.all(result.data.items.map(item =>
      Product.findOneAndUpdate(
        { _id: item.product._id },
        { $inc: { stock: -item.quantity } },
        { new: true }
      )
    ));

    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
};

export const getOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id;
    const order = await Order.findById(id).populate({
      path: "addressId",
      model: "Address",
    }).populate({
      path:"items."
    });
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};
