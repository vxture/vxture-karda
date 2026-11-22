"""Offline joint pricing review. No network, billing writes or runtime imports."""
import argparse
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

D = lambda value: Decimal(str(value))


def rounded(value):
    return float(value.quantize(D("0.01"), rounding=ROUND_HALF_UP))


def estimate(tier, scenario, fee, revenue=None, products=1):
    price = D(tier["price"]) * products if revenue is None else D(revenue)
    n = D(products)
    parts = {
        "ai": D(tier.get("credits", 0)) * D(scenario["ai_per_credit"]) * n,
        "hosted": D(tier.get("storage_gib", 0)) * D(scenario["hosted_per_gib"]) * n,
        "egress": D(tier.get("egress_gib", 0)) * D(scenario["egress_per_gib"]) * n,
        "fixed": D(tier.get("fixed_budget", 0)) * D(scenario["fixed_multiplier"]) * n,
        "workload": D(tier.get("workload_budget", 0)) * D(scenario["workload_multiplier"]) * n,
    }
    nonfee = sum(parts.values(), D(0))
    parts["payment"] = price * fee
    cost = nonfee + parts["payment"]
    return {"revenue": rounded(price), "parts": {k: rounded(v) for k, v in parts.items()},
            "cost": rounded(cost), "contribution": rounded(price - cost),
            "margin_pct": rounded((price - cost) / price * 100)}, nonfee


def calculate(inputs):
    fee = D(inputs["payment_fee"])
    scenarios = inputs["scenarios"]
    results = {"review": inputs["review"], "status": inputs["status"], "tiers": [], "old_offers_on_same_budget": {}, "addons": [], "mixed_joint": [], "order_examples": []}
    for tier in inputs["tiers"]:
        single = {name: estimate(tier, s, fee)[0] for name, s in scenarios.items()}
        floors = {name: estimate(tier, scenarios[name], fee)[1] /
                  (1 - fee - D(inputs[name + "_target_margin"])) for name in ("base", "stress")}
        joint_price = (D(tier["price"]) * 2 * (1 - D(inputs["joint_discount"]))).quantize(D("0.01"), rounding=ROUND_HALF_UP)
        joint = {name: estimate(tier, s, fee, joint_price, 2)[0] for name, s in scenarios.items()}
        list_joint = {name: estimate(tier, s, fee, products=2)[0] for name, s in scenarios.items()}
        # This is a break-even-to-target allowance, not a measured cost estimate.
        base_nonfee = estimate(tier, scenarios["base"], fee)[1]
        stress_nonfee = estimate(tier, scenarios["stress"], fee)[1]
        min_joint = max(floors.values()) * 2
        max_discount = 1 - min_joint / (D(tier["price"]) * 2)
        assert D(tier["price"]) >= max(floors.values())
        for name in ("base", "stress"):
            nonfee = estimate(tier, scenarios[name], fee, products=2)[1]
            assert nonfee <= joint_price * (1 - fee - D(inputs[name + "_target_margin"]))
        results["tiers"].append({"tier": tier["tier"], "single": single, "price_floors": {k: rounded(v) for k, v in floors.items()},
            "joint_list": list_joint, "joint_95_percent": joint, "max_joint_discount_to_both_targets_pct": rounded(max_discount * 100),
            "nonfee_budget": {"base": rounded(base_nonfee), "stress": rounded(stress_nonfee)},
            "ten_percent_discount_stress": estimate(tier, scenarios["stress"], fee, D(tier["price"]) * 2 * D("0.9"), 2)[0]})
    for product, offers in inputs["old_offers"].items():
        results["old_offers_on_same_budget"][product] = [
            {"tier": tier["tier"], **{name: estimate({**tier, **old}, s, fee)[0] for name, s in scenarios.items()}}
            for tier, old in zip(inputs["tiers"], offers, strict=True)]
    for addon in inputs["proposed_addons"]:
        results["addons"].append({"name": addon["name"], **{name: estimate(addon, s, fee)[0] for name, s in scenarios.items()}})
    for arda in inputs["tiers"]:
        for karda in inputs["tiers"]:
            price = ((D(arda["price"]) + D(karda["price"])) * (1 - D(inputs["joint_discount"]))).quantize(D("0.01"), rounding=ROUND_HALF_UP)
            row = {"arda": arda["tier"], "karda": karda["tier"], "price": rounded(price)}
            for name, s in scenarios.items():
                nonfee = estimate(arda, s, fee)[1] + estimate(karda, s, fee)[1]
                cost = nonfee + price * fee
                row[name] = {"cost": rounded(cost), "contribution": rounded(price - cost), "margin_pct": rounded((price - cost) / price * 100)}
            for name in ("base", "stress"):
                nonfee = estimate(arda, scenarios[name], fee)[1] + estimate(karda, scenarios[name], fee)[1]
                assert nonfee <= price * (1 - fee - D(inputs[name + "_target_margin"]))
            results["mixed_joint"].append(row)
    for tier_index, products, extra_storage, extra_credits in ((1, 1, 10, 1000), (1, 2, 10, 1000), (2, 2, 0, 10000)):
        tier = inputs["tiers"][tier_index]
        discount = 1 - D(inputs["joint_discount"]) if products == 2 else D(1)
        storage_pack, credit_pack = inputs["proposed_addons"][:2]
        assert extra_storage % storage_pack["storage_gib"] == 0
        assert extra_credits % credit_pack["credits"] == 0
        addon = {"price": extra_storage // storage_pack["storage_gib"] * storage_pack["price"] + extra_credits // credit_pack["credits"] * credit_pack["price"],
                 "storage_gib": extra_storage, "credits": extra_credits}
        # Discount affects base subscriptions only, not prepaid resource packs.
        price = (D(tier["price"]) * products * discount + D(addon["price"])).quantize(D("0.01"), rounding=ROUND_HALF_UP)
        row = {"tier": tier["tier"], "products": products, "extra_storage_gib": extra_storage, "extra_credits": extra_credits, "revenue": rounded(price)}
        for name, s in scenarios.items():
            nonfee = estimate(tier, s, fee, products=products)[1] + estimate(addon, s, fee)[1]
            cost = nonfee + price * fee
            row[name] = {"cost": rounded(cost), "contribution": rounded(price - cost), "margin_pct": rounded((price - cost) / price * 100)}
        results["order_examples"].append(row)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    path = Path(__file__).with_name("joint-pricing-inputs.json")
    raw = path.read_bytes()
    inputs = json.loads(raw)
    results = calculate(inputs)
    results["inputs_sha256"] = hashlib.sha256(raw).hexdigest()
    payload = json.dumps(results, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="ascii")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
