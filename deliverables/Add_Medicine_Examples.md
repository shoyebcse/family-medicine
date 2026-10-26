# Add Medicine: fields and examples

Enter confirmed prescription information. The app records instructions; it does not select a medicine, recommend a dose or verify treatment suitability. These examples are fictional field-entry examples, not treatment advice.

The form now shows the main medicine and timing fields first. Open **More prescription details (optional)** for composition, form, route, strength and meal directions; blank optional form/route/meal fields are recorded as **Not entered**, which does not mean the prescription itself omitted them. Open **Add stock tracking (optional)** only when needed. Use **Change weekdays** for a non-daily plan. Collapsing sections preserves entered values.

**Preview schedule** remains clickable except during a request and explains missing/invalid entries beside the button. For example, enter amount **1** and unit **tablet**, not **1 tablet** in the numeric box. Twice daily needs two confirmed times. An old sample member ID in a link cannot silently select a different account's member; choose a currently available person.

## Product and amount are different

| Field | Fictional liquid example |
| --- | --- |
| Medicine name | Copy the exact prescribed name |
| Generic/composition | Copy only if stated; otherwise leave blank |
| Form | Liquid / syrup |
| Route | Copy the prescribed route |
| Strength | 125 mg/5 mL |
| Amount each time | 5 |
| Unit | mL |

The strength describes the product. The amount describes how much is taken. The app does not convert concentration into a dose. With an explicitly entered stock of 100 mL and amount of 5 mL, recording Taken deducts 5 mL once, leaving 95 mL. There is no implicit conversion from bottles, strips or packs.

Keep the complete original confirmed instruction in its own field. Record meal directions exactly, or enter **Not specified** when absent. No before-food or after-food rule is assumed. Unclear prescription shorthand needs clarification; the app does not interpret it as treatment times.

## Frequency, times and duration

Select the confirmed frequency and enter each exact reminder time using hour (1–12), minute (00–59), and AM/PM. The app never supplies times from frequency wording. For example, selecting **Twice daily** requires two different confirmed times. Choosing three times is rejected. Other frequency wording is recorded as text and still requires an explicit fixed weekday/time plan.

Start and end dates are blank initially. Copy the confirmed dates; the last date is included. Explicitly acknowledge **No end date specified** only when appropriate. Stock quantity never determines treatment duration. Review the selected weekdays too.

If the prescription does not give a numeric amount, explicitly select that option and keep the original instructions. Stock tracking is disabled. Confirm an unclear dose with the prescriber or pharmacist before use. The app does not estimate an amount.

## Review before saving

Check the member, name, form, route, strength, original instructions, amount/unit, frequency, meals, exact reminder times, selected weekdays and dates. Changes to fields clear the confirmation switch. Preview the occurrences, then select **Save medicine and schedule**. Account records save to PostgreSQL; sample mode remains in memory. Details appear on the saved Family and dose cards.

## Current limits

This form handles one fixed amount repeated at explicit weekday/time slots. As-needed treatment, changing morning/evening amounts, tapering, every-N-hours plans and irregular courses need dedicated scheduling support and are not implemented. As-needed/changing-dose selections cannot be saved as fixed schedules. Free-text instructions are not clinically interpreted or checked for contradictions.

Existing schedules remain unchanged and may not contain the new structured details. Older API clients can still submit the previous contract; this does not make their medicine metadata complete. There is no prescription image extraction, drug-name database, interaction checking or clinical/legal compliance certification in this change.

The field review used Indian [NHM prescription audit guidance](https://nhm.hp.gov.in/storage/app/media/NQAP/1/Prescription-Audit-Guidelines.pdf) as a reference for name, form, strength, dose, route, frequency, meal directions and duration. This is a data-entry improvement, not verification of an individual prescription.


Choose the confirmed start and last treatment dates from the calendar. Opening or closing the calendar does not select a date. For morning and evening reminders, add two rows, for example 8:00 AM and 8:00 PM. The schedule preview displays AM/PM; the server still receives ISO dates and 24-hour times.

