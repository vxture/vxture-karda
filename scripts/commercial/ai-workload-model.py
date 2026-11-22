"""Offline workload-to-credit scenarios, with no inference or commercial writes."""
import argparse
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

D = lambda x: Decimal(str(x))


def number(x):
    return float(x.quantize(D("0.000001"), rounding=ROUND_HALF_UP))


def calculate(work, pricing, estimator, catalog):
    unit_cost = D(work["anchor_cny_per_credit"]) * (1 - D(work["conversion_target_margin"]))
    assert unit_cost == D(pricing["scenarios"]["base"]["ai_per_credit"]), "Align credit conversion and budget cost before comparing margins"
    ops = {}
    for name, calls in work["operations"].items():
        cost = sum((D(call[dim]) * D(work["rates_cny_per_million_tokens"][call["model"]][dim])
                    / D(1000000) for call in calls for dim in ("input", "output")), D(0))
        ops[name] = (cost, cost / unit_cost)
    results = {"review": work["review"], "status": work["status"],
               "cost_per_derived_credit": number(unit_cost),
               "operations": {k: {"supplier_cny": number(v[0]), "derived_credits": number(v[1])} for k, v in ops.items()},
               "products": {}, "joint": [], "discounted_products": []}
    tiers_by_product = {}
    for product, rows in work["monthly_work"].items():
        product_rows, candidate_tiers = [], []
        for i, mix in enumerate(rows):
            base = pricing["tiers"][i]
            final_tier = catalog["tiers"][i]
            assert final_tier["tier"] == base["tier"]
            credits = D(final_tier[product]["ai_credits_month"])
            total = sum((ops[k][1] * count for k, count in mix.items()), D(0))
            current = sum((ops[k.replace("_optimized", "_current")][1] * count for k, count in mix.items()), D(0))
            reserved = total * (1 + D(work["workload_reserve"]))
            assert reserved <= credits, (product, base["tier"], reserved)
            tier = {**base, "price": final_tier["price_cny"], "credits": credits, "storage_gib": final_tier["storage_gib_per_product"],
                    "egress_gib": work["candidate_egress_gib"][i]}
            candidate_tiers.append(tier)
            financials, floors = {}, {}
            for name, scenario in pricing["scenarios"].items():
                financials[name], nonfee = estimator.estimate(tier, scenario, D(pricing["payment_fee"]))
                if name in ("base", "stress"):
                    denominator = 1 - D(pricing["payment_fee"]) - D(pricing[name + "_target_margin"])
                    floors[name] = number(nonfee / denominator)
            product_rows.append({"tier": base["tier"], "included_credits": number(credits),
                "mix": mix, "workload_credits": number(total), "with_reserve": number(reserved),
                "current_chain_with_reserve": number(current * (1 + D(work["workload_reserve"]))),
                "workload_supplier_cny": number(total * unit_cost), "financials": financials, "price_floors": floors})
        results["products"][product] = product_rows
        tiers_by_product[product] = candidate_tiers
    fee = D(pricing["payment_fee"])
    for a in tiers_by_product["arda"]:
        for k in tiers_by_product["karda"]:
            price = ((D(a["price"]) + D(k["price"])) * (1 - D(pricing["joint_discount"]))).quantize(D("0.01"), rounding=ROUND_HALF_UP)
            row = {"arda": a["tier"], "karda": k["tier"], "revenue": number(price)}
            for name, scenario in pricing["scenarios"].items():
                nonfee = sum((estimator.estimate(t, scenario, fee)[1] for t in (a, k)), D(0))
                cost = nonfee + price * fee
                margin = (price - cost) / price
                row[name] = {"cost": number(cost), "contribution": number(price - cost), "margin_pct": number(margin * 100)}
                if name in ("base", "stress"):
                    row[name]["meets_historical_target"] = margin >= D(pricing[name + "_target_margin"])
            results["joint"].append(row)
            coupon_price = (price * (1 - D(work["coupon_discount"]))).quantize(D("0.01"), rounding=ROUND_HALF_UP)
            row["with_coupon"] = {"revenue": number(coupon_price)}
            for name, scenario in pricing["scenarios"].items():
                nonfee = sum((estimator.estimate(t, scenario, fee)[1] for t in (a, k)), D(0))
                cost = nonfee + coupon_price * fee
                row["with_coupon"][name] = {"cost": number(cost), "contribution": number(coupon_price - cost),
                    "margin_pct": number((coupon_price - cost) / coupon_price * 100)}
    for product, tiers in tiers_by_product.items():
        for tier in tiers:
            price = (D(tier["price"]) * (1 - D(work["coupon_discount"]))).quantize(D("0.01"), rounding=ROUND_HALF_UP)
            results["discounted_products"].append({"product": product, "tier": tier["tier"],
                **{name: estimator.estimate(tier, scenario, fee, revenue=price)[0]
                   for name, scenario in pricing["scenarios"].items()}})
    # Annual billing collects ten monthly list prices but serves twelve months.
    # Include single-product, joint and full-cycle coupon stress cases. This is
    # a budget scenario, not proof that the billing platform supports stacking.
    annual = catalog["annual_billing"]
    paid, served = D(annual["paid_months"]), D(annual["service_months"])
    results["annual"] = []
    combinations = [(product, [tier]) for product, tiers in tiers_by_product.items() for tier in tiers]
    combinations += [("joint", [a, k]) for a in tiers_by_product["arda"] for k in tiers_by_product["karda"]]
    for product, tiers in combinations:
        gross = sum((D(t["price"]) * paid for t in tiers), D(0))
        for coupon in (False, True):
            factor = (1 - D(pricing["joint_discount"])) if product == "joint" else D(1)
            if coupon:
                factor *= 1 - D(work["coupon_discount"])
            revenue = (gross * factor).quantize(D("0.01"), rounding=ROUND_HALF_UP)
            row = {"product": product, "tiers": [t["tier"] for t in tiers], "coupon": coupon,
                   "paid_months": number(paid), "service_months": number(served), "revenue": number(revenue)}
            for name, scenario in pricing["scenarios"].items():
                nonfee = sum((estimator.estimate(t, scenario, fee)[1] for t in tiers), D(0)) * served
                cost = nonfee + revenue * fee
                row[name] = {"cost": number(cost), "contribution": number(revenue - cost),
                             "margin_pct": number((revenue - cost) / revenue * 100)}
            results["annual"].append(row)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    folder = Path(__file__).parent
    work_raw = (folder / "ai-workload-inputs.json").read_bytes()
    price_raw = (folder / "joint-pricing-inputs.json").read_bytes()
    spec = spec_from_file_location("joint_pricing", folder / "joint-pricing-model.py")
    estimator = module_from_spec(spec)
    spec.loader.exec_module(estimator)
    catalog_raw = (folder / "final-package-spec.json").read_bytes()
    results = calculate(json.loads(work_raw), json.loads(price_raw), estimator, json.loads(catalog_raw))
    results["input_sha256"] = {"workload": hashlib.sha256(work_raw).hexdigest(), "pricing": hashlib.sha256(price_raw).hexdigest(), "catalog": hashlib.sha256(catalog_raw).hexdigest()}
    payload = json.dumps(results, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="ascii")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
