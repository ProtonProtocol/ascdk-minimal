import { ActionWrapper, Name, packer, Table } from "as-chain"

// Contract
export const kv = Name.fromString("kv")

// Tables
export const kvs = Name.fromString("kvs")

// Actions
export const updatevalues = new ActionWrapper(Name.fromString("updatevalues"))
export const removekeys = new ActionWrapper(Name.fromString("removekeys"))

// Include
@packer
class kv_contants extends Table { constructor() { super(); } }